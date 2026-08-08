import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * Rate limiting shared across application instances.
 *
 * Replaces `lib/marketing/rate-limit.ts`, which kept its counters in process
 * memory. That gave every container its own budget — so the real limit was
 * `limit x instances` — and a restart reset it, meaning an attacker could
 * clear their own budget by causing a deploy. For a marketing form that was a
 * cheap ceiling on flooding and honestly labelled as such. For login,
 * registration and password reset it is not a limit at all, and it is exactly
 * the endpoints where the limit is the control that matters.
 *
 * Fixed windows rather than a sliding log: a burst can straddle a boundary and
 * briefly allow up to 2x the limit, which is an acceptable trade for one
 * indexed upsert per call. A sliding window would need per-request rows and a
 * range scan, which is the wrong cost for endpoints that exist to be slow.
 */

export type RateLimitRule = {
  /** Namespace, so two endpoints never share a budget. */
  bucket: string;
  limit: number;
  windowMs: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
};

/**
 * The rules, in one place so they can be reviewed as a set.
 *
 * Deliberately asymmetric. Login is generous enough that a person fat-fingering
 * their password is never locked out, but far below what credential stuffing
 * needs. Password reset and verification resend are tighter because each one
 * sends an email — an unthrottled endpoint that emails an arbitrary address is
 * a way to use this platform to harass someone.
 */
export const RATE_LIMITS = {
  login: { bucket: "auth:login", limit: 10, windowMs: 15 * 60_000 },
  /** Second, stricter budget keyed on the account rather than the caller. */
  loginPerAccount: { bucket: "auth:login:account", limit: 20, windowMs: 60 * 60_000 },
  register: { bucket: "auth:register", limit: 5, windowMs: 60 * 60_000 },
  passwordResetRequest: { bucket: "auth:reset:request", limit: 5, windowMs: 60 * 60_000 },
  passwordResetConfirm: { bucket: "auth:reset:confirm", limit: 10, windowMs: 60 * 60_000 },
  verificationResend: { bucket: "auth:verify:resend", limit: 5, windowMs: 60 * 60_000 },
  contactForm: { bucket: "marketing:contact", limit: 5, windowMs: 60 * 60_000 },
  newsletter: { bucket: "marketing:newsletter", limit: 5, windowMs: 60 * 60_000 },
  /**
   * V3 surfaces. Keyed on the *workspace* rather than the caller, because what
   * is being protected is spend, not an authentication surface: every AI call
   * and every knowledge upload costs money attributable to the workspace,
   * whichever member or office IP happens to make it. The public advisor is
   * the exception and stays IP-keyed, since it has no workspace.
   */
  aiWorkspaceChat: { bucket: "ai:chat:workspace", limit: 120, windowMs: 60 * 60_000 },
  aiPublicChat: { bucket: "ai:chat:public", limit: 30, windowMs: 60 * 60_000 },
  knowledgeUpload: { bucket: "ai:knowledge:upload", limit: 60, windowMs: 60 * 60_000 },
  sitePublish: { bucket: "sites:publish", limit: 20, windowMs: 60 * 60_000 },
  siteGeneration: { bucket: "sites:ai-generate", limit: 10, windowMs: 60 * 60_000 },
  domainVerification: { bucket: "domains:verify", limit: 30, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Hashes the subject before it becomes part of a stored key.
 *
 * The subject is an IP address or an email — both personal data. Storing them
 * in plaintext would turn a rate-limit table into a log of who tried to sign
 * in from where, retained indefinitely, for no operational benefit: nothing
 * ever needs to read the subject back, only to match it.
 */
function hashSubject(subject: string): string {
  return createHash("sha256").update(subject.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function buildKey(rule: RateLimitRule, subject: string, now: number): string {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  return `${rule.bucket}:${hashSubject(subject)}:${windowStart}`;
}

/**
 * Consumes one unit of budget and reports whether the caller may proceed.
 *
 * **Fails open.** If the database is unreachable the request is allowed and
 * the failure is logged. That is the deliberate choice: a rate limiter that
 * fails closed converts a database blip into a total authentication outage —
 * nobody can log in, including the people trying to fix it. The exposure while
 * failing open is bounded by the outage itself, and the outage is already the
 * bigger problem.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  subject: string,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const windowStart = new Date(Math.floor(now / rule.windowMs) * rule.windowMs);
  const expiresAt = new Date(windowStart.getTime() + rule.windowMs);
  const key = buildKey(rule, subject, now);

  try {
    // Upsert-and-increment in one statement. Two concurrent requests cannot
    // both read 4 and both write 5 — the increment happens in the database.
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_counters ("key", "count", "window_start", "expires_at")
      VALUES (${key}, 1, ${windowStart}, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET "count" = rate_limit_counters."count" + 1
      RETURNING "count"
    `;
    const count = rows[0]?.count ?? 1;
    const allowed = count <= rule.limit;

    return {
      allowed,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)),
      limit: rule.limit,
    };
  } catch (error) {
    logger.error("ratelimit.unavailable", { bucket: rule.bucket }, error);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, limit: rule.limit };
  }
}

/**
 * Reads the current usage without consuming any.
 *
 * Used where the limit must be checked before doing work but only charged if
 * the work actually happens.
 */
export async function peekRateLimit(
  rule: RateLimitRule,
  subject: string,
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  const key = buildKey(rule, subject, now);
  try {
    const row = await prisma.rateLimitCounter.findUnique({ where: { key }, select: { count: true } });
    const count = row?.count ?? 0;
    const windowEnd = Math.floor(now / rule.windowMs) * rule.windowMs + rule.windowMs;
    return {
      allowed: count < rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: count < rule.limit ? 0 : Math.max(1, Math.ceil((windowEnd - now) / 1000)),
      limit: rule.limit,
    };
  } catch (error) {
    logger.error("ratelimit.unavailable", { bucket: rule.bucket }, error);
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0, limit: rule.limit };
  }
}

/** Headers a limited endpoint should return, per the draft IETF conventions. */
export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
  };
  if (!decision.allowed) headers["Retry-After"] = String(decision.retryAfterSeconds);
  return headers;
}

/**
 * Best-effort caller identity.
 *
 * `x-forwarded-for` is client-controllable unless a trusted proxy overwrites
 * it, so this is a mitigation against ordinary abuse, not a security boundary
 * — which is why the account-scoped budget in `RATE_LIMITS.loginPerAccount`
 * exists alongside the IP one. Rotating IPs defeats the first; it cannot
 * defeat the second, because the account being attacked is fixed.
 */
export function callerIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Deletes counters whose window has passed. Called by the cleanup job. */
export async function pruneRateLimitCounters(now: Date = new Date()): Promise<number> {
  const result = await prisma.rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}
