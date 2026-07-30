/**
 * Narrow, in-process rate limiter for the two public marketing forms.
 *
 * **Scope and honesty about it.** This is deliberately small. It is per-process
 * and in-memory, so with multiple app instances each gets its own budget, and a
 * restart clears it. That is not adequate as the platform's abuse-control
 * story, and it is not presented as one — `docs/FINAL-LAUNCH-AUDIT.md` §8.2
 * records that real distributed limiting belongs to Phase 5, alongside login,
 * registration and password reset.
 *
 * It exists now because Phase 1 adds two endpoints that write a database row
 * per request, and shipping those with no limit at all would be a regression.
 * A cheap ceiling on obvious flooding is worth having in the meantime; it is
 * not worth pretending it is more than that.
 *
 * Phase 5 replaces this with the shared limiter and deletes this file.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Bound the map so a spray of unique keys cannot grow it without limit. */
const MAX_TRACKED_KEYS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      // Still full of live buckets: fail open rather than deny real users.
      if (buckets.size >= MAX_TRACKED_KEYS) {
        return { allowed: true, retryAfterSeconds: 0 };
      }
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seam — production code never needs this. */
export function resetRateLimits(): void {
  buckets.clear();
}
