import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import worker, { type Env } from "@/cloudflare/website-platform/src/index";
import { resolveRoute } from "@/cloudflare/website-platform/src/routing";
import {
  SIGNATURE_HEADERS,
  canonicalRequestString,
  sha256Hex,
  signRequest,
} from "@/cloudflare/website-platform/src/signing";
import {
  canonicalRequestString as coreCanonical,
  signRequest as coreSign,
  verifySignedRequest,
} from "@/lib/cloudflare/signatures";

/**
 * The dispatch Worker.
 *
 * Tested in the repository's own vitest run rather than behind a second
 * toolchain. The Workers-specific surface it touches is small — `caches.default`
 * and a dispatch-namespace binding — and both are stubbed here, which keeps the
 * routing, caching, header and failure logic under test on every CI run instead
 * of only when someone remembers to enter the worker directory.
 */

const SECRET = "a-signing-secret-that-is-at-least-32-characters-long";

type CacheEntry = { body: string };

/** A `caches.default` stand-in with the small surface the Worker uses. */
function installCache() {
  const store = new Map<string, CacheEntry>();
  const cache = {
    async match(request: Request) {
      const entry = store.get(request.url);
      return entry ? new Response(entry.body) : undefined;
    },
    async put(request: Request, response: Response) {
      store.set(request.url, { body: await response.text() });
    },
  };
  (globalThis as unknown as { caches: unknown }).caches = { default: cache };
  return store;
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    TRIPISTIC_API_ORIGIN: "https://app.tripistic.test",
    TRIPISTIC_WORKER_SIGNING_SECRET: SECRET,
    DISPATCHER: {
      get: () => ({ fetch: async () => new Response("<h1>Tenant page</h1>", { status: 200 }) }),
    },
    ...overrides,
  } as Env;
}

/** Stubs the routing lookup response from Tripistic Core. */
function stubLookup(payload: unknown, init: ResponseInit = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, ...init }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

const FOUND = {
  found: true,
  scriptName: "site-ws123-site456",
  siteId: "site456",
  preview: false,
  deploymentId: "dep_1",
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  installCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("signing parity with Tripistic Core", () => {
  /**
   * The failure this prevents is total and silent until deploy: a reordered
   * canonical field makes every routing lookup 401, and every tenant site
   * falls back to "Site not found".
   */
  it("produces the same canonical string as the Core implementation", async () => {
    const shared = {
      method: "GET",
      path: "/api/internal/site-routing?hostname=acme.tripistic.site",
      timestampSeconds: 1_700_000_000,
      nonce: "0123456789abcdef0123456789abcdef",
      bodyHash: await sha256Hex(""),
    };
    expect(await canonicalRequestString(shared)).toBe(await coreCanonical(shared));
  });

  it("produces a signature Core accepts", async () => {
    const path = "/api/internal/site-routing?hostname=acme.tripistic.site";
    const headers = await signRequest({ method: "GET", path, secret: SECRET });

    const verification = await verifySignedRequest({
      method: "GET",
      path,
      body: "",
      headers: new Headers(headers),
      secret: SECRET,
    });

    expect(verification.ok).toBe(true);
  });

  it("is rejected by Core when the secret differs", async () => {
    const path = "/api/internal/site-routing?hostname=acme.tripistic.site";
    const headers = await signRequest({ method: "GET", path, secret: SECRET });

    const verification = await verifySignedRequest({
      method: "GET",
      path,
      body: "",
      headers: new Headers(headers),
      secret: `${SECRET}-different`,
    });

    expect(verification.ok).toBe(false);
  });

  it("accepts a Core-signed request with the Worker's own header names", async () => {
    const headers = await coreSign({ method: "GET", path: "/x", secret: SECRET });
    expect(headers).toHaveProperty(SIGNATURE_HEADERS.signature);
    expect(headers).toHaveProperty(SIGNATURE_HEADERS.timestamp);
    expect(headers).toHaveProperty(SIGNATURE_HEADERS.nonce);
  });
});

describe("route resolution", () => {
  it("signs the lookup and caches the result", async () => {
    const fetchMock = stubLookup(FOUND);

    const first = await resolveRoute("acme.tripistic.site", env());
    const second = await resolveRoute("acme.tripistic.site", env());

    expect(first).toMatchObject({ found: true, stale: false });
    expect(second).toMatchObject({ found: true, stale: false });
    // Second call served from the colo cache.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers[SIGNATURE_HEADERS.signature]).toMatch(/^v1=[0-9a-f]{64}$/);
    // The secret itself must never travel.
    expect(JSON.stringify(headers)).not.toContain(SECRET);
  });

  it("caches a miss too, so an unconfigured domain does not hammer the origin", async () => {
    const fetchMock = stubLookup({ found: false });

    await resolveRoute("not-set-up.example.com", env());
    await resolveRoute("not-set-up.example.com", env());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A site already serving traffic must not go dark because the control plane
   * blipped. The tenant Worker holds its own content and needs nothing from
   * Core to render.
   */
  it("serves a stale route when the origin is unreachable", async () => {
    stubLookup(FOUND);
    await resolveRoute("acme.tripistic.site", env());

    // Age the entry past its TTL but inside the stale grace window. A zero TTL
    // would be the obvious way to force this, but `ttl()` rejects zero on
    // purpose — a zero-second cache is an origin lookup per request.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("origin down");
    }) as unknown as typeof fetch;

    const result = await resolveRoute("acme.tripistic.site", env());
    expect(result).toMatchObject({ found: true, stale: true });
    vi.useRealTimers();
  });

  it("stops serving stale once the grace window has passed", async () => {
    stubLookup(FOUND);
    await resolveRoute("acme.tripistic.site", env());

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 3_600_000);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("origin down");
    }) as unknown as typeof fetch;

    expect(await resolveRoute("acme.tripistic.site", env())).toEqual({ found: false, stale: true });
    vi.useRealTimers();
  });

  it("reports not-found when the origin is unreachable and nothing is cached", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("origin down");
    }) as unknown as typeof fetch;

    expect(await resolveRoute("cold.tripistic.site", env())).toEqual({ found: false, stale: true });
  });

  it("treats a non-200 lookup as a failure rather than a miss", async () => {
    stubLookup({ found: true }, { status: 500 });
    const result = await resolveRoute("acme.tripistic.site", env());
    expect(result).toEqual({ found: false, stale: true });
  });
});

describe("dispatch", () => {
  async function get(url: string, overrides: Partial<Env> = {}) {
    return worker.fetch(new Request(url), env(overrides));
  }

  it("answers its own health check without touching the origin", async () => {
    const fetchMock = stubLookup(FOUND);
    const response = await get("https://acme.tripistic.site/__tripistic/dispatch-health");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, role: "dispatch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to the tenant Worker and adds security headers", async () => {
    stubLookup(FOUND);
    const response = await get("https://acme.tripistic.site/tours");

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Tenant page");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("marks a preview deployment noindex at the header level", async () => {
    stubLookup({ ...FOUND, preview: true });
    const response = await get("https://preview-dep1.preview.tripistic.site/");

    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("does not mark a production deployment noindex", async () => {
    stubLookup(FOUND);
    const response = await get("https://acme.tripistic.site/");

    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("serves a branded 404 for an unknown hostname", async () => {
    stubLookup({ found: false });
    const response = await get("https://nobody.tripistic.site/");

    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain("Site not found");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("serves a 404 when the namespace has no such script", async () => {
    stubLookup(FOUND);
    const response = await get("https://acme.tripistic.site/", {
      DISPATCHER: {
        get: () => {
          throw new Error("script not found");
        },
      },
    } as Partial<Env>);

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("not currently deployed");
  });

  /**
   * A tenant Worker throwing must not leak its reason. The script is generated
   * by Tripistic, but the message could still echo tenant content, and a stack
   * trace on a customer's homepage helps nobody.
   */
  it("hides the reason when the tenant Worker throws", async () => {
    stubLookup(FOUND);
    const response = await get("https://acme.tripistic.site/", {
      DISPATCHER: {
        get: () => ({
          fetch: async () => {
            throw new Error("ReferenceError: payload is not defined at line 42");
          },
        }),
      },
    } as Partial<Env>);

    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain("temporarily unavailable");
    expect(body).not.toContain("ReferenceError");
    expect(body).not.toContain("line 42");
  });

  it("flags a stale routing answer for observability", async () => {
    stubLookup(FOUND);
    await resolveRoute("acme.tripistic.site", env());

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("origin down");
    }) as unknown as typeof fetch;

    const response = await get("https://acme.tripistic.site/");
    expect(response.headers.get("X-Tripistic-Route")).toBe("stale");
    vi.useRealTimers();
  });
});
