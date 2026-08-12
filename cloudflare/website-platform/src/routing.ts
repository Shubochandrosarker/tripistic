import { signRequest } from "./signing";

/**
 * Hostname → tenant Worker resolution, with a colo-local cache.
 *
 * The mapping lives in Tripistic Core, so a cold lookup is an origin round
 * trip. Two things keep that off the critical path:
 *
 *   - **The Cache API**, keyed on a synthetic URL. One lookup per hostname per
 *     colo per TTL, not one per request.
 *   - **Negative caching**, briefly. A hostname pointed at Tripistic before
 *     the site exists is the normal state during DNS setup, and re-asking the
 *     origin on every request from a crawler that found the CNAME early is how
 *     a routine misconfiguration becomes load.
 *
 * On an origin failure the last good answer is reused past its TTL. A site
 * already serving traffic should not go dark because the control plane is
 * briefly unavailable — the tenant Worker holds its own content and needs
 * nothing from Core to render.
 */

export type SiteRoute = {
  scriptName: string;
  siteId: string;
  preview: boolean;
  deploymentId: string;
};

export type RouteLookup =
  | { found: true; route: SiteRoute; stale: boolean }
  | { found: false; stale: boolean };

export type RoutingEnv = {
  TRIPISTIC_API_ORIGIN: string;
  TRIPISTIC_WORKER_SIGNING_SECRET: string;
  ROUTE_CACHE_TTL_SECONDS?: string;
  ROUTE_NEGATIVE_TTL_SECONDS?: string;
};

const DEFAULT_TTL_SECONDS = 60;
const DEFAULT_NEGATIVE_TTL_SECONDS = 15;
/** How long a stale entry may still be served when the origin is unreachable. */
const STALE_GRACE_SECONDS = 600;

function ttl(env: RoutingEnv, key: "ROUTE_CACHE_TTL_SECONDS" | "ROUTE_NEGATIVE_TTL_SECONDS", fallback: number) {
  const parsed = Number.parseInt(env[key] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 600) : fallback;
}

/**
 * The cache key.
 *
 * A synthetic `https://route.tripistic.internal/...` URL rather than the real
 * request URL: the entry describes a *lookup result*, not a page, and keying it
 * on the visitor's URL would store one entry per path for the same answer.
 */
function cacheKey(hostname: string): Request {
  return new Request(`https://route.tripistic.internal/v1/${encodeURIComponent(hostname)}`, {
    method: "GET",
  });
}

type CachedPayload = { found: boolean; route?: SiteRoute; storedAt: number };

export async function resolveRoute(hostname: string, env: RoutingEnv): Promise<RouteLookup> {
  const cache = caches.default;
  const key = cacheKey(hostname);

  const cached = await cache.match(key);
  let lastGood: CachedPayload | null = null;

  if (cached) {
    const payload = (await cached.clone().json()) as CachedPayload;
    const age = (Date.now() - payload.storedAt) / 1000;
    const limit = payload.found
      ? ttl(env, "ROUTE_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS)
      : ttl(env, "ROUTE_NEGATIVE_TTL_SECONDS", DEFAULT_NEGATIVE_TTL_SECONDS);

    if (age <= limit) {
      return payload.found && payload.route
        ? { found: true, route: payload.route, stale: false }
        : { found: false, stale: false };
    }
    if (age <= STALE_GRACE_SECONDS) lastGood = payload;
  }

  try {
    const path = `/api/internal/site-routing?hostname=${encodeURIComponent(hostname)}`;
    const headers = await signRequest({
      method: "GET",
      path,
      secret: env.TRIPISTIC_WORKER_SIGNING_SECRET,
    });

    const response = await fetch(`${env.TRIPISTIC_API_ORIGIN}${path}`, {
      headers,
      // The Cache API entry above is the cache. Letting `fetch` cache as well
      // would layer two TTLs and make invalidation unpredictable.
      cf: { cacheTtl: 0, cacheEverything: false },
    });

    if (!response.ok) throw new Error(`routing lookup failed: ${response.status}`);
    const body = (await response.json()) as {
      found: boolean;
      scriptName?: string;
      siteId?: string;
      preview?: boolean;
      deploymentId?: string;
    };

    const payload: CachedPayload = body.found
      ? {
          found: true,
          route: {
            scriptName: String(body.scriptName),
            siteId: String(body.siteId),
            preview: Boolean(body.preview),
            deploymentId: String(body.deploymentId),
          },
          storedAt: Date.now(),
        }
      : { found: false, storedAt: Date.now() };

    await cache.put(
      key,
      new Response(JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
          // Long max-age with our own freshness check on top: the Cache API
          // needs a positive TTL to retain the entry at all, and serving stale
          // during an origin outage requires the entry to still be there.
          "Cache-Control": `max-age=${STALE_GRACE_SECONDS}`,
        },
      }),
    );

    return payload.found && payload.route
      ? { found: true, route: payload.route, stale: false }
      : { found: false, stale: false };
  } catch {
    if (lastGood) {
      return lastGood.found && lastGood.route
        ? { found: true, route: lastGood.route, stale: true }
        : { found: false, stale: true };
    }
    return { found: false, stale: true };
  }
}
