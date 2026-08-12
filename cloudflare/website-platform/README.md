# Tripistic dispatch Worker

Routes every public tenant-site hostname to the Worker that serves it.

One dispatch Worker owns `*.tripistic.site`, the preview domain, and every
verified custom hostname. Tenant sites live as individual Workers inside a
Workers-for-Platforms dispatch namespace, uploaded by Tripistic Core at publish
time (`lib/cloudflare/workers-platform.ts`). This Worker is the thing in front
of them.

```
visitor → dispatch Worker → resolve hostname → dispatch namespace → tenant Worker
                 │
                 └── GET /api/internal/site-routing  (HMAC-signed, colo-cached)
```

## Why a dispatcher at all

A Cloudflare route per customer does not scale, and neither does a Worker per
customer on the public zone. A dispatch namespace gives per-tenant isolation —
separate memory, separate bindings, no shared globals — behind a single route.

## The security model

**Tenants never author code that runs here, or anywhere.** A tenant supplies
structured page content, validated by Zod (`lib/sites/schema.ts`). Tripistic
generates the tenant Worker from a fixed template (`lib/sites/worker-runtime.ts`)
and uploads it. The only tenant-derived value in a tenant Worker is a JSON
payload parsed from a string literal, so tenant content is never positioned
where it could become code.

The dispatcher holds the signing secret and the namespace binding and passes
neither downstream. A tenant Worker's bindings are pre-rendered pages and a
public API origin, so even a fully compromised tenant script reaches only data
that was already public.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `TRIPISTIC_API_ORIGIN` | `wrangler.toml` `[vars]` | Core origin for routing lookups |
| `ENVIRONMENT` | `wrangler.toml` `[vars]` | Reported by the health endpoint |
| `ROUTE_CACHE_TTL_SECONDS` | `wrangler.toml` `[vars]` | Positive-result cache, default 60 |
| `ROUTE_NEGATIVE_TTL_SECONDS` | `wrangler.toml` `[vars]` | Miss cache, default 15 |
| `TRIPISTIC_WORKER_SIGNING_SECRET` | **`wrangler secret put`** | HMAC key, must match Core |

The signing secret is never committed and never placed in `[vars]`. Set it per
environment:

```bash
wrangler secret put TRIPISTIC_WORKER_SIGNING_SECRET --env staging
wrangler secret put TRIPISTIC_WORKER_SIGNING_SECRET --env production
```

It must be byte-identical to `TRIPISTIC_WORKER_SIGNING_SECRET` on Tripistic
Core, and at least 32 characters — Core refuses to start edge auth below that.

## Routing lookups

`GET /api/internal/site-routing?hostname=…` on Core, signed with HMAC plus a
timestamp and a single-use nonce. It answers with a script name and a preview
flag, never with tenant content.

Results are cached in the colo-local Cache API, misses included — a hostname
CNAMEd to Tripistic before its site exists is normal during DNS setup, and
re-asking the origin for every crawler hit turns that into load.

When the origin is unreachable the last good answer is served past its TTL for
up to ten minutes, with `X-Tripistic-Route: stale` on the response. A site that
is already serving should not go dark because the control plane blipped; the
tenant Worker holds its own content and needs nothing from Core to render.

## Response headers

Every dispatched response gets `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin` and a restrictive `Permissions-Policy`.
Preview deployments additionally get `X-Robots-Tag: noindex, nofollow` — the
generated page already carries a noindex meta tag, but a crawler that reads
headers and skips the body, or a non-HTML response like the sitemap, needs the
header too.

## Health

```
GET /__tripistic/dispatch-health → { "ok": true, "role": "dispatch", ... }
```

Namespaced under `/__tripistic/` so it cannot collide with a tenant page path;
`sitePagePathSchema` reserves the same prefix on the tenant side.

## Failure pages

Unknown hostname → branded 404. Script missing from the namespace → branded
404. Tenant Worker threw → branded 500 with **no** detail: the script is
generated, but its error message could still echo tenant content, and a stack
trace on a customer's homepage helps nobody.

## Tests and types

Both run from the repository root, not from this directory:

```bash
npm run typecheck          # includes cloudflare/website-platform/src/**
npm run test:unit          # includes tests/unit/dispatch-worker.test.ts
```

That is deliberate. A second toolchain for ~200 lines of edge code is a second
thing CI can forget to run. `src/cloudflare.d.ts` declares the two runtime
extensions this Worker uses (`caches.default`, `RequestInit.cf`) so the root
`tsc` covers it without `@cloudflare/workers-types`.

`tests/unit/dispatch-worker.test.ts` asserts that this Worker's canonical
signing string is byte-identical to Core's and that Core accepts a
Worker-produced signature. A divergence there would 401 every lookup and take
every tenant site to the fallback page, so it is pinned rather than trusted.

## Deploying

```bash
npm run deploy:dry-run     # bundles and validates without uploading
npm run deploy:staging
npm run deploy:production
```

Routes are declared per environment. A bare `wrangler deploy` with no `--env`
has no routes and cannot take over production hostnames.

Custom tenant hostnames reach this Worker through Cloudflare for SaaS custom
hostnames pointed at the fallback origin — not as `routes` entries. There is one
Worker and an unbounded number of tenant domains.
