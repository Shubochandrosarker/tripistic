/**
 * The handful of Cloudflare runtime extensions this Worker actually uses.
 *
 * Declared locally instead of depending on `@cloudflare/workers-types` so the
 * Worker is covered by the repository's single `npm run typecheck` and its
 * single `vitest` run. A second toolchain for ~200 lines of edge code would
 * mean a second thing CI can forget to run, and the practical result of that
 * is a dispatch Worker whose types nobody checks.
 *
 * The trade-off is that this file must stay a faithful subset. It is: both
 * declarations below are stable parts of the Workers runtime, and anything
 * beyond them is deliberately not used.
 */

declare global {
  interface CacheStorage {
    /** The Workers runtime's colo-local cache. Not part of the DOM standard. */
    default: Cache;
  }

  interface RequestInit {
    /** Cloudflare-specific per-request options (cache TTL, resolve overrides). */
    cf?: Record<string, unknown>;
  }
}

export {};
