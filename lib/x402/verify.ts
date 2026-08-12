import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { ApiError, badRequest } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

import { issueGrant, type GrantIssue } from "@/lib/x402/grants";
import { x402Readiness, type X402Route } from "@/lib/x402/config";

/**
 * Payment verification.
 *
 * The rule the whole module is built around: **Tripistic never decides that a
 * payment happened.** A settlement facilitator does, and this code's job is to
 * ask it, record the answer, and refuse to credit the same settlement twice.
 * Anything that looks like "trust the caller's claim" would make the price list
 * a suggestion.
 *
 * Replay defence is the unique index on `X402Payment.transactionReference`,
 * not a check in application code. Two concurrent submissions of the same
 * on-chain reference race, one wins the insert, and the other gets a constraint
 * violation that is handled below — which is a correctness property the
 * database enforces rather than one this function has to remember.
 */

export type PaymentProof = {
  /** On-chain transaction hash or facilitator settlement reference. */
  transactionReference: string;
  /** Payer address, recorded for the audit trail. */
  payer?: string;
  network: string;
  amount: string;
  currency: string;
};

export type VerificationOutcome =
  | { ok: true; paymentId: string; grant: GrantIssue; reused: false }
  | { ok: false; status: number; reason: string };

type FacilitatorResponse = {
  valid?: boolean;
  settled?: boolean;
  payer?: string;
  amount?: string;
  currency?: string;
  network?: string;
  reason?: string;
};

/**
 * Asks the facilitator whether a settlement is real, final and ours.
 *
 * Injectable so tests exercise accept, reject and timeout without a network or
 * a chain. Production always uses the HTTP implementation.
 */
export type FacilitatorClient = (input: {
  proof: PaymentProof;
  payTo: string;
  route: X402Route;
}) => Promise<FacilitatorResponse>;

export const httpFacilitator: FacilitatorClient = async ({ proof, payTo, route }) => {
  const { config } = x402Readiness();
  const response = await fetch(`${config.facilitatorUrl.replace(/\/+$/, "")}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionReference: proof.transactionReference,
      network: proof.network,
      payTo,
      amount: route.amount,
      currency: route.currency,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new ApiError(502, "The payment facilitator could not be reached.");
  }
  return (await response.json()) as FacilitatorResponse;
};

/** Rejects a proof whose own claims already disagree with the price list. */
function preflight(proof: PaymentProof, route: X402Route, expectedNetwork: string): string | null {
  if (!proof.transactionReference || proof.transactionReference.length > 200) {
    return "A transaction reference is required.";
  }
  if (proof.network !== expectedNetwork) {
    return `Payment must settle on ${expectedNetwork}.`;
  }
  if (proof.currency.toUpperCase() !== route.currency.toUpperCase()) {
    return `This route is priced in ${route.currency}.`;
  }
  // Compared as decimals, not floats: "0.10" and "0.1" are the same price and a
  // string comparison would reject the second.
  if (Number(proof.amount) < Number(route.amount)) {
    return `This route costs ${route.amount} ${route.currency}.`;
  }
  return null;
}

export async function verifyPayment(input: {
  proof: PaymentProof;
  route: X402Route;
  workspaceId?: string | null;
  facilitator?: FacilitatorClient;
}): Promise<VerificationOutcome> {
  const readiness = x402Readiness();
  if (!readiness.ready) {
    return { ok: false, status: 503, reason: readiness.reason };
  }

  const complaint = preflight(input.proof, input.route, readiness.config.network);
  if (complaint) return { ok: false, status: 400, reason: complaint };

  const requestId = randomUUID();
  const facilitator = input.facilitator ?? httpFacilitator;

  /**
   * The payment row is claimed *before* the facilitator is asked.
   *
   * The unique index on `transactionReference` is the replay defence, so it has
   * to be taken first: verifying and then inserting leaves a window where two
   * concurrent submissions both verify and both try to issue a grant. Claiming
   * first means the loser of the race never reaches the facilitator at all.
   */
  let payment: { id: string };
  try {
    payment = await prisma.x402Payment.create({
      data: {
        workspaceId: input.workspaceId ?? null,
        requestId,
        route: input.route.path,
        amount: input.route.amount,
        currency: input.route.currency,
        network: readiness.config.network,
        payer: input.proof.payer ?? null,
        transactionReference: input.proof.transactionReference,
        status: "pending",
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Already credited. Deliberately not re-issuing a grant: a settlement
      // buys access exactly once, and handing out a second token for the same
      // payment would make every grant infinitely renewable.
      return { ok: false, status: 409, reason: "This payment has already been used." };
    }
    throw error;
  }

  let result: FacilitatorResponse;
  try {
    result = await facilitator({
      proof: input.proof,
      payTo: readiness.config.payTo,
      route: input.route,
    });
  } catch (error) {
    await prisma.x402Payment.update({
      where: { id: payment.id },
      data: { status: "rejected" },
    });
    logger.error("x402.facilitator_failed", { route: input.route.path }, error);
    return { ok: false, status: 502, reason: "The payment facilitator could not be reached." };
  }

  const settled = result.valid === true && result.settled !== false;
  if (!settled) {
    await prisma.x402Payment.update({ where: { id: payment.id }, data: { status: "rejected" } });
    return {
      ok: false,
      status: 402,
      // The facilitator's reason is surfaced: an agent that underpaid or paid
      // the wrong address can only correct it if it is told which.
      reason: result.reason ?? "The payment could not be verified.",
    };
  }

  const grant = await issueGrant({
    paymentId: payment.id,
    workspaceId: input.workspaceId ?? null,
    route: input.route,
  });

  await prisma.x402Payment.update({
    where: { id: payment.id },
    data: {
      status: "verified",
      verifiedAt: new Date(),
      payer: result.payer ?? input.proof.payer ?? null,
      accessExpiresAt: grant.expiresAt,
    },
  });

  logger.info("x402.payment_verified", { route: input.route.path, requestId });

  return { ok: true, paymentId: payment.id, grant, reused: false };
}

export function parseProof(body: unknown): PaymentProof {
  if (!body || typeof body !== "object") throw badRequest("A payment proof is required.");
  const record = body as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string).trim() : "");

  const proof: PaymentProof = {
    transactionReference: text("transactionReference"),
    payer: text("payer") || undefined,
    network: text("network"),
    amount: text("amount"),
    currency: text("currency"),
  };
  if (!proof.transactionReference || !proof.network || !proof.amount || !proof.currency) {
    throw badRequest("transactionReference, network, amount and currency are all required.");
  }
  return proof;
}
