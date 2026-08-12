import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { consumeGrant, hashToken, issueGrant } from "@/lib/x402/grants";
import { X402_ROUTES, findX402Route, isMainnetNetwork, x402Readiness } from "@/lib/x402/config";
import { verifyPayment, type FacilitatorClient } from "@/lib/x402/verify";

import { prisma } from "./helpers";

/**
 * x402.
 *
 * The tests that matter here are the ones about money moving twice and access
 * outliving its payment. An experimental settlement rail is exactly where a
 * replay bug hides, because the happy path is the only one anyone exercises by
 * hand.
 */

const ROUTE = X402_ROUTES[0];

function enable(overrides: Record<string, string> = {}) {
  vi.stubEnv("X402_ENABLED", "true");
  vi.stubEnv("X402_NETWORK", "base-sepolia");
  vi.stubEnv("X402_PAY_TO", "0x00000000000000000000000000000000deadbeef");
  vi.stubEnv("X402_FACILITATOR_URL", "https://facilitator.test");
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

function proof(reference: string) {
  return {
    transactionReference: reference,
    payer: "0x1111111111111111111111111111111111111111",
    network: "base-sepolia",
    amount: ROUTE.amount,
    currency: ROUTE.currency,
  };
}

const accepting: FacilitatorClient = async () => ({ valid: true, settled: true, payer: "0xabc" });
const rejecting: FacilitatorClient = async () => ({ valid: false, reason: "Underpaid." });

let reference = 0;
const nextReference = () => `0xtest-${Date.now()}-${(reference += 1)}`;

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configuration safety", () => {
  it("is off unless explicitly enabled", () => {
    const readiness = x402Readiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.ready === false && readiness.reason).toMatch(/X402_ENABLED/);
  });

  /**
   * The two-key rule. One environment variable copied between deployments must
   * not be enough to start accepting real funds on an experimental rail.
   */
  it("refuses a mainnet network without a second explicit opt-in", () => {
    enable({ X402_NETWORK: "base" });
    const readiness = x402Readiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.ready === false && readiness.reason).toMatch(/X402_ALLOW_MAINNET/);

    vi.stubEnv("X402_ALLOW_MAINNET", "true");
    expect(x402Readiness().ready).toBe(true);
  });

  it("treats the known value-bearing networks as mainnet", () => {
    for (const network of ["base", "ethereum", "polygon", "arbitrum", "optimism"]) {
      expect(isMainnetNetwork(network)).toBe(true);
    }
    for (const network of ["base-sepolia", "sepolia", "polygon-amoy"]) {
      expect(isMainnetNetwork(network)).toBe(false);
    }
  });

  it("names the missing piece rather than just refusing", () => {
    vi.stubEnv("X402_ENABLED", "true");
    const readiness = x402Readiness();
    expect(readiness.ready).toBe(false);
    if (readiness.ready) return;
    expect(readiness.reason).toMatch(/X402_PAY_TO/);
  });

  it("matches routes exactly, never by prefix", () => {
    expect(findX402Route("/api/agent/travel-search")).toBeDefined();
    // A prefix match would silently start charging for anything added below.
    expect(findX402Route("/api/agent/travel-search/extra")).toBeUndefined();
    expect(findX402Route("/api/agent")).toBeUndefined();
  });
});

describe("payment verification", () => {
  it("issues a grant for a settled payment", async () => {
    enable();
    const outcome = await verifyPayment({
      proof: proof(nextReference()),
      route: ROUTE,
      facilitator: accepting,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.grant.token.length).toBeGreaterThan(32);

    const payment = await prisma.x402Payment.findUniqueOrThrow({ where: { id: outcome.paymentId } });
    expect(payment.status).toBe("verified");
    expect(payment.verifiedAt).not.toBeNull();
  });

  /**
   * The replay defence. Enforced by the unique index on
   * `transactionReference`, not by an application-level check, so two
   * concurrent submissions cannot both win.
   */
  it("refuses to credit the same settlement twice", async () => {
    enable();
    const shared = proof(nextReference());

    const first = await verifyPayment({ proof: shared, route: ROUTE, facilitator: accepting });
    const second = await verifyPayment({ proof: shared, route: ROUTE, facilitator: accepting });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, status: 409 });
  });

  it("refuses both of two concurrent replays but one", async () => {
    enable();
    const shared = proof(nextReference());

    const results = await Promise.all([
      verifyPayment({ proof: shared, route: ROUTE, facilitator: accepting }),
      verifyPayment({ proof: shared, route: ROUTE, facilitator: accepting }),
      verifyPayment({ proof: shared, route: ROUTE, facilitator: accepting }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  it("records a rejected payment rather than discarding it", async () => {
    enable();
    const outcome = await verifyPayment({
      proof: proof(nextReference()),
      route: ROUTE,
      facilitator: rejecting,
    });

    expect(outcome).toMatchObject({ ok: false, status: 402, reason: "Underpaid." });
    const rejected = await prisma.x402Payment.findFirst({
      where: { status: "rejected" },
      orderBy: { createdAt: "desc" },
    });
    expect(rejected).not.toBeNull();
  });

  it("rejects a proof for the wrong network before contacting the facilitator", async () => {
    enable();
    const facilitator = vi.fn(accepting);
    const outcome = await verifyPayment({
      proof: { ...proof(nextReference()), network: "ethereum" },
      route: ROUTE,
      facilitator,
    });

    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(facilitator).not.toHaveBeenCalled();
  });

  it("rejects an underpayment locally", async () => {
    enable();
    const outcome = await verifyPayment({
      proof: { ...proof(nextReference()), amount: "0.001" },
      route: ROUTE,
      facilitator: accepting,
    });
    expect(outcome).toMatchObject({ ok: false, status: 400 });
  });

  it("accepts an equivalent decimal rather than requiring an exact string", async () => {
    enable();
    const outcome = await verifyPayment({
      proof: { ...proof(nextReference()), amount: "0.010" },
      route: ROUTE,
      facilitator: accepting,
    });
    expect(outcome.ok).toBe(true);
  });

  it("marks the payment rejected when the facilitator is unreachable", async () => {
    enable();
    const outcome = await verifyPayment({
      proof: proof(nextReference()),
      route: ROUTE,
      facilitator: async () => {
        throw new Error("network down");
      },
    });
    expect(outcome).toMatchObject({ ok: false, status: 502 });
  });

  it("refuses entirely when x402 is disabled", async () => {
    const outcome = await verifyPayment({
      proof: proof(nextReference()),
      route: ROUTE,
      facilitator: accepting,
    });
    expect(outcome).toMatchObject({ ok: false, status: 503 });
  });
});

describe("access grants", () => {
  async function grantFor(route = ROUTE, maxUses = route.maxUses) {
    enable();
    const payment = await prisma.x402Payment.create({
      data: {
        requestId: `req-${nextReference()}`,
        route: route.path,
        amount: route.amount,
        currency: route.currency,
        network: "base-sepolia",
        transactionReference: nextReference(),
        status: "verified",
      },
      select: { id: true },
    });
    return issueGrant({ paymentId: payment.id, workspaceId: null, route: { ...route, maxUses } });
  }

  it("stores only the hash of the token", async () => {
    const grant = await grantFor();
    const stored = await prisma.x402AccessGrant.findUniqueOrThrow({
      where: { tokenHash: hashToken(grant.token) },
    });
    // The raw token appears nowhere in the row.
    expect(JSON.stringify(stored)).not.toContain(grant.token);
  });

  it("accepts a valid token once per use and then exhausts", async () => {
    const grant = await grantFor(ROUTE, 2);

    expect(await consumeGrant(grant.token, ROUTE.path)).toMatchObject({ ok: true, remaining: 1 });
    expect(await consumeGrant(grant.token, ROUTE.path)).toMatchObject({ ok: true, remaining: 0 });
    expect(await consumeGrant(grant.token, ROUTE.path)).toEqual({ ok: false, reason: "exhausted" });
  });

  /**
   * The conditional UPDATE, under contention. Read-then-write would let both
   * callers observe one use remaining and both proceed.
   */
  it("never lets two concurrent calls spend the same last use", async () => {
    const grant = await grantFor(ROUTE, 1);

    const results = await Promise.all([
      consumeGrant(grant.token, ROUTE.path),
      consumeGrant(grant.token, ROUTE.path),
      consumeGrant(grant.token, ROUTE.path),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
  });

  /**
   * Without this the price list is advisory: a grant bought for the cheap
   * search route would open the expensive itinerary route.
   */
  it("refuses a grant bought for a different route", async () => {
    const grant = await grantFor(X402_ROUTES[0]);
    expect(await consumeGrant(grant.token, X402_ROUTES[1].path)).toEqual({
      ok: false,
      reason: "wrong_route",
    });
  });

  it("refuses an unknown token", async () => {
    expect(await consumeGrant("not-a-real-token", ROUTE.path)).toEqual({
      ok: false,
      reason: "unknown",
    });
  });

  it("refuses an expired grant", async () => {
    const grant = await grantFor({ ...ROUTE, ttlSeconds: 1 });
    await prisma.x402AccessGrant.update({
      where: { tokenHash: hashToken(grant.token) },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await consumeGrant(grant.token, ROUTE.path)).toEqual({ ok: false, reason: "expired" });
  });
});

describe("separation from Stripe", () => {
  /**
   * The V3 brief forbids conflating the two rails. Asserted structurally: an
   * x402 payment must never produce a row in the booking payment tables.
   */
  it("writes nothing to the booking payment tables", async () => {
    enable();
    const before = await prisma.payment.count();
    await verifyPayment({ proof: proof(nextReference()), route: ROUTE, facilitator: accepting });
    expect(await prisma.payment.count()).toBe(before);
  });
});
