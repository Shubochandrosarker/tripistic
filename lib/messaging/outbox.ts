import { Prisma } from "@prisma/client";
import type { Message, MessageTemplateKey } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * Delivery retries for transactional email.
 *
 * The defect this closes (docs/FINAL-LAUNCH-AUDIT.md §5): `sendTrackedEmail`
 * attempted delivery exactly once and wrote `status: failed` on any error.
 * Nothing ever looked at those rows again. A thirty-second SMTP outage
 * therefore permanently destroyed every booking confirmation sent during it —
 * the guest was charged, the booking was real, and the only notice they would
 * ever get was gone. The row recorded the loss faithfully and no code path
 * could act on it.
 *
 * Two things have to be true for retries to be safe rather than merely
 * present:
 *
 *   1. A retry must never produce a second email. That is what `dedupeKey`
 *      is for — a unique constraint, so concurrency is resolved by the
 *      database rather than by hoping two sweeps do not overlap.
 *   2. A permanent failure must stop, and must look different from a
 *      transient one. Retrying a malformed address five times just delays
 *      the moment an operator finds out, and burns provider reputation.
 */

/**
 * Backoff schedule in milliseconds, indexed by attempt number.
 *
 * Roughly 1m, 5m, 15m, 1h, 6h — chosen so a brief provider blip is absorbed
 * within minutes while a longer outage still gets several shots across a day
 * without hammering a provider that is already unhealthy. The last entry is
 * reused if `maxAttempts` is ever raised above the schedule's length.
 */
export const RETRY_BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000] as const;

export const DEFAULT_MAX_ATTEMPTS = 5;

export function retryDelayMs(attempt: number): number {
  if (attempt < 1) return RETRY_BACKOFF_MS[0];
  return RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
}

export function nextRetryTime(attempt: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + retryDelayMs(attempt));
}

/**
 * Provider responses that retrying cannot fix.
 *
 * A 5xx SMTP reply is a permanent rejection by definition (RFC 5321): the
 * mailbox does not exist, the domain does not resolve, the recipient is
 * blocked. Attempting those four more times cannot change the outcome, delays
 * the operator finding out, and damages sending reputation. Anything not
 * matched here is treated as transient, which is the safe default — a
 * message retried unnecessarily is recoverable, one dropped is not.
 */
const PERMANENT_PATTERNS: RegExp[] = [
  /**
   * SMTP reply code. Anchored to the start of a line and range-limited to
   * 500–559, because that is where a real reply code appears.
   *
   * Deliberately NOT `\b5\d{2}\b`, and not `\s`-prefixed either: the loose
   * forms match the port in `connect ECONNREFUSED 10.0.0.4:587` and a bare
   * figure in prose like `socket hang up after 502 ms`, classifying ordinary
   * transient errors as permanent. Being wrong in that direction silently
   * destroys a guest's confirmation, so a genuine 5xx that arrives without
   * its code at line start is left to the textual patterns below and, failing
   * those, simply costs a few wasted retries.
   */
  /^\s*5[0-5]\d(?:[\s-]|$)/m,
  /** Enhanced status code (RFC 3463) — `5.x.y` is a permanent failure. */
  /(?:^|\s)5\.\d{1,3}\.\d{1,3}(?:\s|$)/,
  /invalid (recipient|address|mailbox)/i,
  /(recipient|mailbox|user|address).{0,20}(not found|unknown|does not exist|rejected)/i,
  /no such (user|mailbox|recipient)/i,
  /domain .{0,40}(not found|does not exist)/i,
  /blocked|blacklist|spam|unsubscribed/i,
];

/**
 * Missing configuration is deliberately transient.
 *
 * `getMailer()` throws when SMTP_HOST is unset, which is the normal state of
 * a fresh deployment before email is wired up. Treating that as permanent
 * would burn all five attempts within minutes of boot and terminally fail
 * every message queued before the operator finished configuring email — the
 * messages most worth keeping. Held as retryable, they simply deliver once
 * configuration lands.
 */
const NOT_CONFIGURED = /not configured|no mailer|SMTP_HOST/i;

export function isPermanentFailure(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  if (NOT_CONFIGURED.test(errorMessage)) return false;
  return PERMANENT_PATTERNS.some((pattern) => pattern.test(errorMessage));
}

/**
 * Stable identity for a message.
 *
 * Keyed on what makes two sends "the same message" from a guest's point of
 * view — this template, for this booking, to this address. Deliberately not
 * time-based: a retry an hour later must collide with the original, which is
 * the entire point.
 */
export function buildDedupeKey(input: {
  workspaceId: string;
  templateKey: MessageTemplateKey;
  bookingId?: string | null;
  to: string;
  discriminator?: string | null;
}): string {
  return [
    input.workspaceId,
    input.templateKey,
    input.bookingId ?? "-",
    input.to.trim().toLowerCase(),
    input.discriminator ?? "-",
  ].join(":");
}

export type OutboxPayload = {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
};

/** Narrow runtime check — `payload` is Json, so it can be anything on read. */
export function isOutboxPayload(value: unknown): value is OutboxPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.to === "string" &&
    typeof p.from === "string" &&
    typeof p.subject === "string" &&
    typeof p.text === "string" &&
    typeof p.html === "string"
  );
}

/**
 * Records the outcome of one delivery attempt and decides what happens next.
 *
 * The payload is cleared on any terminal outcome. It holds the rendered body —
 * guest name, reference, meeting point — and there is no reason to retain a
 * copy of that indefinitely once it can never be sent again. The `Message`
 * row itself remains as the audit trail.
 */
export async function recordDeliveryAttempt(
  messageId: string,
  outcome: { status: "sent" | "failed"; providerMessageId: string | null; errorMessage: string | null },
  now: Date = new Date(),
): Promise<Message> {
  const current = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
  const attempts = current.attempts + 1;

  if (outcome.status === "sent") {
    return prisma.message.update({
      where: { id: messageId },
      data: {
        status: "sent",
        attempts,
        lastAttemptAt: now,
        sentAt: now,
        nextRetryAt: null,
        providerMessageId: outcome.providerMessageId,
        errorMessage: null,
        payload: Prisma.DbNull,
      },
    });
  }

  const permanent = isPermanentFailure(outcome.errorMessage);
  const exhausted = attempts >= current.maxAttempts;
  const terminal = permanent || exhausted;

  return prisma.message.update({
    where: { id: messageId },
    data: {
      status: terminal ? "failed" : "pending_retry",
      attempts,
      lastAttemptAt: now,
      nextRetryAt: terminal ? null : nextRetryTime(attempts, now),
      errorMessage: outcome.errorMessage,
      // `Prisma.DbNull` rather than plain `null`: for a Json column those mean
      // different things — SQL NULL versus the JSON value `null`.
      ...(terminal ? { payload: Prisma.DbNull } : {}),
    },
  });
}

/**
 * Messages whose retry is due.
 *
 * Ordered oldest-first so a backlog drains in the order guests were affected
 * rather than newest-first, and capped so one sweep cannot spend an unbounded
 * amount of time (or send an unbounded burst) after a long outage.
 */
export async function findDueRetries(now: Date = new Date(), limit = 100): Promise<Message[]> {
  return prisma.message.findMany({
    where: { status: "pending_retry", nextRetryAt: { not: null, lte: now } },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
}
