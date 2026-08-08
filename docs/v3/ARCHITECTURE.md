# Tripistic V3 — Runtime Architecture

## Shape

```
                          CLOUDFLARE EDGE
   ┌──────────────┬──────────────┬──────────────┬──────────────┐
   │  WAF / CDN   │  AI Gateway  │   Custom     │  Workers for │
   │              │  (analytics, │  Hostnames   │  Platforms   │
   │              │   retries)   │  (SaaS TLS)  │  dispatch ns │
   └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
          │              │              │              │
          │        Workers AI      DNS/TLS state   user Workers
          │        Vectorize        polled by      (one per
          │        R2               Core           published site)
          │              │              │              │
          └──────────────┴──────┬───────┴──────────────┘
                                │  public tours API (unauthenticated)
                                │  signed service API (HMAC + nonce)
                                ▼
                         TRIPISTIC CORE  (Hostinger VPS, Docker)
                         Next.js 15 App Router
          ┌───────────────┬───────────────┬───────────────┐
          │   Auth.js v5  │    Prisma     │    Stripe     │
          └───────────────┴───────┬───────┴───────────────┘
                                  │
                            PostgreSQL
                       (single system of record)
```

## Rules the architecture holds to

**PostgreSQL is the only system of record.** No user, workspace, tour, booking,
payment, subscription or domain lives in D1. Cloudflare stores derived or
edge-specific state only: a compiled Worker script, a vector index, an object
in R2. Every one of those can be rebuilt from PostgreSQL, which is the test for
whether something is allowed to live there.

**Tripistic Core is the control plane.** Cloudflare is called *by* Core, never
the reverse for anything privileged. The one inbound path — a site Worker
reading tour data — goes to the *public* tours API, the same endpoint a
visitor's browser calls, so a compromised Worker discloses nothing that was not
already public.

**Nothing an edge component sends is trusted.** `workspaceId`, `userId`, `role`
and `plan` are always resolved server-side. `lib/cloudflare/edge-auth.ts`
returns a workspace row it looked up, never the header it was given.

**Every Cloudflare capability is optional.** Capability detection is per
service (`lib/cloudflare/config.ts`), so a deployment with no Cloudflare
account boots unchanged, every pre-V3 route works, and the admin health view
reports "Not Configured" rather than a failure.

## Request paths

| Request | Path |
|---|---|
| `app.tripistic.com/dashboard/*` | VPS → Next.js → Prisma |
| `tripistic.com/book/<slug>` | VPS → middleware stamps tenant → storefront |
| `<slug>.tripistic.com` | middleware rewrites to `/book/<slug>` |
| operator custom domain → storefront | middleware → `/api/internal/host-cache` → rewrite |
| `<sub>.tripistic.site` (published Site) | Cloudflare dispatch Worker → user Worker → static HTML + live tour fetch |
| operator custom domain → Site | Custom Hostname → dispatch Worker → user Worker |

The last two never reach the VPS for HTML. That is the point of the Site
Builder: a tenant marketing site is served from the edge and its origin load is
one cached JSON call per 60 seconds.

## What V3 added

| Area | Module |
|---|---|
| Cloudflare API client, capability detection | `lib/cloudflare/{client,config}.ts` |
| Signed Worker↔Core auth, replay protection | `lib/cloudflare/{signatures,edge-auth,replay}.ts` |
| Workers for Platforms | `lib/cloudflare/workers-platform.ts` |
| Vectorize | `lib/cloudflare/vectorize.ts` |
| AI Gateway routing | `lib/cloudflare/ai-gateway.ts` |
| Site Builder model, templates, renderer | `lib/sites/*` |
| AI tasks, metering, tools, safety | `lib/ai/*` |
| RAG | `lib/ai/rag/*` |

## What V3 deliberately did not change

Auth, RBAC, tenancy, tours, bookings, capacity, payments, Stripe Connect,
waivers, CRM, operations, fleet, vendors, itineraries, the v2 storefront,
custom-domain DNS/TLS verification, and the job runner. All 330 pre-existing
integration tests still pass unmodified.
