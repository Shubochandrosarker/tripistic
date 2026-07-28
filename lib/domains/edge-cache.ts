type HostMapping =
  | { found: true; workspaceSlug: string; redirectTo: string | null }
  | { found: false };

type CachedMapping = {
  value: HostMapping;
  expiresAt: number;
};

const globalCache = globalThis as typeof globalThis & {
  __tripisticHostCache?: Map<string, CachedMapping>;
};

function cacheStore() {
  if (!globalCache.__tripisticHostCache) globalCache.__tripisticHostCache = new Map();
  return globalCache.__tripisticHostCache;
}

function ttlMs() {
  const seconds = Number.parseInt(process.env.HOSTNAME_EDGE_CACHE_TTL_SECONDS ?? "60", 10);
  return Math.max(5, Math.min(Number.isFinite(seconds) ? seconds : 60, 600)) * 1000;
}

function internalBaseUrl(requestUrl: URL) {
  return (process.env.HOSTNAME_CACHE_INTERNAL_URL || process.env.APP_URL || requestUrl.origin).replace(/\/+$/, "");
}

export async function resolveHostMappingFromEdgeCache(hostname: string, requestUrl: URL): Promise<HostMapping> {
  const cache = cacheStore();
  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const secret = process.env.HOSTNAME_CACHE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return { found: false };
  }

  try {
    const url = new URL("/api/internal/host-cache", internalBaseUrl(requestUrl));
    url.searchParams.set("hostname", hostname);
    const response = await fetch(url, {
      headers: { "x-tripistic-internal-secret": secret },
      cache: "no-store",
    });
    const value: HostMapping = response.ok ? ((await response.json()) as HostMapping) : { found: false };
    cache.set(hostname, { value, expiresAt: Date.now() + ttlMs() });
    return value;
  } catch {
    return { found: false };
  }
}

export function clearHostCacheForTest() {
  cacheStore().clear();
}
