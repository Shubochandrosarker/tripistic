import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  RATE_LIMITS,
  buildKey,
  callerIp,
  consumeRateLimit,
  peekRateLimit,
  pruneRateLimitCounters,
  rateLimitHeaders,
} from "@/lib/security/rate-limit";
import { prisma } from "./helpers";

/**
 * Phase 7 — rate limiting shared across instances.
 *
 * The limiter this replaces kept counters in process memory, so every
 * container had its own budget (the real limit was `limit x instances`) and a
 * restart cleared it. For a marketing form that was a labelled stopgap; for
 * login and password reset it is not a limit at all.
 */

const subject = () => `test-${randomUUID()}`;
const RULE = { bucket: "test:bucket", limit: 3, windowMs: 60_000 };

describe("consuming budget", () => {
  it("allows up to the limit and refuses past it", async () => {
    const who = subject();
    for (let i = 1; i <= RULE.limit; i += 1) {
      const decision = await consumeRateLimit(RULE, who);
      expect(decision.allowed, `call ${i}`).toBe(true);
    }
    const over = await consumeRateLimit(RULE, who);
    expect(over.allowed).toBe(false);
    expect(over.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts down remaining budget", async () => {
    const who = subject();
    expect((await consumeRateLimit(RULE, who)).remaining).toBe(2);
    expect((await consumeRateLimit(RULE, who)).remaining).toBe(1);
    expect((await consumeRateLimit(RULE, who)).remaining).toBe(0);
  });

  it("keeps subjects independent", async () => {
    const a = subject();
    const b = subject();
    for (let i = 0; i < RULE.limit + 1; i += 1) await consumeRateLimit(RULE, a);

    // One abusive caller must not lock out everyone else.
    expect((await consumeRateLimit(RULE, b)).allowed).toBe(true);
  });

  it("keeps buckets independent, so one endpoint cannot exhaust another", async () => {
    const who = subject();
    const other = { bucket: "test:other", limit: 3, windowMs: 60_000 };
    for (let i = 0; i < RULE.limit + 1; i += 1) await consumeRateLimit(RULE, who);
    expect((await consumeRateLimit(other, who)).allowed).toBe(true);
  });

  it("starts a fresh budget in the next window", async () => {
    const who = subject();
    const now = Date.now();
    for (let i = 0; i < RULE.limit + 1; i += 1) await consumeRateLimit(RULE, who, now);
    expect((await consumeRateLimit(RULE, who, now)).allowed).toBe(false);

    expect((await consumeRateLimit(RULE, who, now + RULE.windowMs)).allowed).toBe(true);
  });

  it("increments atomically under concurrency", async () => {
    // The whole reason the increment is a single SQL statement: two callers
    // reading 4 and both writing 5 would hand out twice the budget.
    const who = subject();
    const rule = { bucket: "test:concurrent", limit: 5, windowMs: 60_000 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => consumeRateLimit(rule, who)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

describe("stored counters", () => {
  it("never stores the subject in a readable form", async () => {
    // Subjects are IP addresses and email addresses. Nothing ever reads one
    // back, so keeping them in plaintext would turn this table into a log of
    // who signed in from where, retained for no operational benefit.
    const email = `person-${randomUUID()}@example.com`;
    await consumeRateLimit(RULE, email);

    const rows = await prisma.rateLimitCounter.findMany({
      where: { key: { startsWith: RULE.bucket } },
    });
    for (const row of rows) {
      expect(row.key).not.toContain(email);
      expect(row.key).not.toContain("@");
    }
  });

  it("keys the window into the id, so expiry is a delete not a rewrite", () => {
    const now = 1_800_000_000_000;
    const a = buildKey(RULE, "someone", now);
    const b = buildKey(RULE, "someone", now + RULE.windowMs);
    expect(a).not.toBe(b);
    expect(buildKey(RULE, "someone", now + 1)).toBe(a);
  });

  it("prunes counters whose window has passed", async () => {
    const who = subject();
    await consumeRateLimit(RULE, who, Date.now() - 10 * RULE.windowMs);
    const removed = await pruneRateLimitCounters(new Date());
    expect(removed).toBeGreaterThan(0);
  });
});

describe("peek", () => {
  it("reports usage without spending any", async () => {
    const who = subject();
    await consumeRateLimit(RULE, who);
    const first = await peekRateLimit(RULE, who);
    const second = await peekRateLimit(RULE, who);
    expect(first.remaining).toBe(second.remaining);
    expect(first.remaining).toBe(RULE.limit - 1);
  });

  it("reports an untouched subject as fully available", async () => {
    expect((await peekRateLimit(RULE, subject())).remaining).toBe(RULE.limit);
  });
});

describe("headers", () => {
  it("advertises the limit, and Retry-After only when refused", async () => {
    const who = subject();
    const allowed = await consumeRateLimit(RULE, who);
    expect(rateLimitHeaders(allowed)["Retry-After"]).toBeUndefined();
    expect(rateLimitHeaders(allowed)["RateLimit-Limit"]).toBe("3");

    for (let i = 0; i < RULE.limit; i += 1) await consumeRateLimit(RULE, who);
    const refused = await consumeRateLimit(RULE, who);
    expect(refused.allowed).toBe(false);
    expect(Number(rateLimitHeaders(refused)["Retry-After"])).toBeGreaterThan(0);
  });
});

describe("caller identification", () => {
  it("takes the first hop from x-forwarded-for", () => {
    const request = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    });
    expect(callerIp(request)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(callerIp(new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.9" } }))).toBe(
      "198.51.100.9",
    );
    expect(callerIp(new Request("https://x.test"))).toBe("unknown");
  });
});

describe("the configured rules", () => {
  it("gives every endpoint its own bucket", () => {
    const buckets = Object.values(RATE_LIMITS).map((rule) => rule.bucket);
    expect(new Set(buckets).size).toBe(buckets.length);
  });

  it("is tighter on the endpoints that send email than on login", () => {
    // An unthrottled endpoint that emails an arbitrary address is a way to use
    // this platform to harass someone.
    expect(RATE_LIMITS.passwordResetRequest.limit).toBeLessThan(RATE_LIMITS.login.limit);
    expect(RATE_LIMITS.verificationResend.limit).toBeLessThan(RATE_LIMITS.login.limit);
  });

  it("is generous enough on login that a mistyped password is not a lockout", () => {
    expect(RATE_LIMITS.login.limit).toBeGreaterThanOrEqual(5);
  });

  it("budgets login per account as well as per caller", () => {
    // `x-forwarded-for` is client-controllable, so the caller budget alone is
    // a speed bump; the account under attack cannot be rotated.
    expect(RATE_LIMITS.loginPerAccount.bucket).not.toBe(RATE_LIMITS.login.bucket);
    expect(RATE_LIMITS.loginPerAccount.windowMs).toBeGreaterThanOrEqual(RATE_LIMITS.login.windowMs);
  });
});
