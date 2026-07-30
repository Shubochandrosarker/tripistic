import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";

/**
 * Lead capture for the public marketing forms.
 *
 * The rule this module exists to enforce: **a submission is persisted before
 * any delivery is attempted, and persistence never depends on delivery
 * succeeding.** Previously both handlers emailed the sales inbox and returned
 * success — so with SMTP unconfigured (the default, per `.env.example`) the
 * address was written to a log line and discarded, while the UI told the
 * visitor to check their inbox for a confirmation that was never sent.
 */

/** Case- and whitespace-insensitive identity for an email address. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Salted digest of a client identifier.
 *
 * Stored instead of a raw IP or user agent. The operational question is
 * "do these submissions share an origin", which a stable digest answers,
 * without retaining a value that is personal data subject to erasure.
 * Salted with AUTH_SECRET so the digests are not reversible via a rainbow
 * table of the IPv4 space.
 */
export function hashClientValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const salt = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${trimmed}`).digest("hex").slice(0, 32);
}

/** First hop of `x-forwarded-for`, which is the client as seen by the proxy. */
export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}

export type LeadClientContext = {
  clientHash: string | null;
  userAgentHash: string | null;
};

export function leadClientContext(headers: Headers): LeadClientContext {
  return {
    clientHash: hashClientValue(clientIpFrom(headers)),
    userAgentHash: hashClientValue(headers.get("user-agent")),
  };
}

export type RecordContactInput = {
  name: string;
  email: string;
  company?: string;
  reason: string;
  message: string;
  source?: string;
  client: LeadClientContext;
};

/** Persists a contact enquiry. Called before any delivery attempt. */
export async function recordContactSubmission(input: RecordContactInput) {
  return prisma.marketingContactSubmission.create({
    data: {
      name: input.name,
      email: input.email,
      emailNormalized: normalizeEmail(input.email),
      company: input.company ?? null,
      reason: input.reason,
      message: input.message,
      source: input.source ?? null,
      consentAt: new Date(),
      clientHash: input.client.clientHash,
      userAgentHash: input.client.userAgentHash,
    },
  });
}

export type RecordSubscriberInput = {
  email: string;
  source?: string;
  client: LeadClientContext;
};

export type RecordSubscriberResult = {
  id: string;
  /** True when this address was already on the list. */
  alreadySubscribed: boolean;
};

/**
 * Persists a newsletter subscriber idempotently.
 *
 * A repeat signup updates the existing row rather than erroring, so the caller
 * can return an identical response either way. That identical response is the
 * point: a different message for "already subscribed" would let anyone test
 * whether a given address is on the list.
 */
export async function recordNewsletterSubscriber(
  input: RecordSubscriberInput,
): Promise<RecordSubscriberResult> {
  const emailNormalized = normalizeEmail(input.email);
  const existing = await prisma.newsletterSubscriber.findUnique({
    where: { emailNormalized },
    select: { id: true },
  });

  if (existing) {
    await prisma.newsletterSubscriber.update({
      where: { emailNormalized },
      data: {
        // A re-subscribe after unsubscribing is consent to receive again, and
        // carries a fresh consent timestamp.
        status: "pending_confirmation",
        unsubscribedAt: null,
        source: input.source ?? undefined,
        consentAt: new Date(),
      },
    });
    return { id: existing.id, alreadySubscribed: true };
  }

  const created = await prisma.newsletterSubscriber.create({
    data: {
      email: input.email.trim(),
      emailNormalized,
      source: input.source ?? null,
      consentAt: new Date(),
      clientHash: input.client.clientHash,
      userAgentHash: input.client.userAgentHash,
    },
    select: { id: true },
  });
  return { id: created.id, alreadySubscribed: false };
}

export type DeliveryOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Records what happened to the notification, separately from the lead itself. */
export async function markContactDelivery(id: string, outcome: DeliveryOutcome) {
  await prisma.marketingContactSubmission.update({
    where: { id },
    data: {
      deliveryStatus: outcome.status,
      deliveryError: outcome.status === "sent" ? null : outcome.reason,
      deliveredAt: outcome.status === "sent" ? new Date() : null,
    },
  });
}

export async function markSubscriberDelivery(id: string, outcome: DeliveryOutcome) {
  await prisma.newsletterSubscriber.update({
    where: { id },
    data: {
      deliveryStatus: outcome.status,
      deliveryError: outcome.status === "sent" ? null : outcome.reason,
      deliveredAt: outcome.status === "sent" ? new Date() : null,
    },
  });
}
