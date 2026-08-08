# Tripistic V3 — Current State Audit (Phase 0)

Date: 2026-08-08
Baseline commit: `471f007` (`main`, package version `2.0.0`)
Branch for this work: `claude/tripistic-production-upgrade-62u450`

This audit was produced by reading the repository before any V3 code was
written, as required by Phase 0. Everything below was verified against the
source, not inferred from the existing `docs/AUDIT.md` — several statements in
that v2.0.0 document are now out of date and are corrected here.

---

## 1. Measured shape of the repository

| Metric | Count |
|---|---|
| API route files (`app/api/**/route.ts`) | 127 |
| Exported route handlers (`GET`/`POST`/`PATCH`/`PUT`/`DELETE`) | 168 |
| App Router pages (`page.tsx`) | 87 |
| React components (`components/**/*.tsx`) | 93 |
| Library modules (`lib/**/*.ts`) | 107 |
| Prisma models | 62 |
| Prisma enums | 45 |
| Prisma migrations | 23 |
| Unit tests | 279 (22 files) |
| Integration tests | 330 (36 files) |
| Playwright specs | 5 |

Verified green on this baseline before any change:

```
npm run lint            → pass
npm run typecheck       → pass
npm run test:unit       → 279 passed
npm run test:integration→ 330 passed
```

Integration tests need a live PostgreSQL and a `.env.test`; `DATABASE_URL`
must contain `tripistic_test` or `tests/integration/global-setup.ts` refuses
to run (it truncates every table). One test — `payment-webhook.test.ts` —
additionally needs `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` set to any
non-empty test values.

---

## 2. Architecture as it exists

```
                         Cloudflare (DNS/CDN + Custom Hostnames only today)
                                        |
                              Hostinger VPS (Docker)
                                        |
                             Next.js 15.5 App Router
                    (middleware.ts → Edge; route handlers → Node)
                                        |
        +---------------+---------------+---------------+
        |               |               |               |
     Auth.js v5      Prisma 6.19      Stripe 22        SMTP
     (credentials)       |         (+ Connect)      (nodemailer)
                         |
                    PostgreSQL  ← single system of record
```

`middleware.ts` is the tenant router. It resolves the request hostname into a
storefront in three ways:

1. `platformSubdomain()` — `<slug>.tripistic.com` rewrites straight to
   `/book/<slug>`, no database access.
2. `resolveHostMappingFromEdgeCache()` — a custom hostname is resolved via a
   fetch to `/api/internal/host-cache` guarded by `HOSTNAME_CACHE_SECRET`, with
   an in-process TTL cache (default 60s, clamped 5–600s). Edge middleware
   deliberately never touches Prisma.
3. Apex path routing — `tripistic.com/book/<slug>` reads the slug from the
   path.

The resolved slug is stamped onto the request as `x-tripistic-storefront`,
always overwritten and never merged, so a client cannot forge another
operator's branding. A correlation id (`REQUEST_ID_HEADER`) is set on every
response.

**This matters for V3:** hostname→workspace resolution is *already solved*
and is not, as the V3 brief assumed, an open item. What is missing is
hostname→**site**→**published revision**→**user Worker**, which is the
Workers-for-Platforms dispatch step.

---

## 3. Domain-by-domain findings

### 3.1 Authentication — working

- Auth.js v5 (`next-auth@5.0.0-beta.32`), credentials provider, bcrypt.
- `lib/auth/tokens.ts` implements email verification and password reset with
  single-use claim via a raw parameterised `$queryRaw` (atomic `UPDATE …
  RETURNING`), so a token cannot be redeemed twice under concurrency.
- `AuthToken` + `RateLimitCounter` models exist (migration
  `20260730180000_auth_tokens_and_rate_limits`).
- Gaps: no MFA, no SSO/SAML (the `sso_saml` plan flag is deliberately wired to
  `false` in the catalog with a comment saying so — honest, not a bug).

### 3.2 Authorization / RBAC — working

`lib/auth/permissions.ts` uses explicit capability predicates
(`canManageTours`, `canViewBookingPII`, …) rather than a linear role ladder.
PII-bearing reads are separated from redacted reads.

### 3.3 Multi-tenancy — working, one path

`lib/tenancy/workspace.ts::requireWorkspaceAccess` is the single guard, and it
throws **404** (not 403) for out-of-tenant lookups so existence is not leaked.
Verified: every route file under `app/api/workspaces/**` calls it except
`app/api/workspaces/route.ts`, which is the collection route (list-my-workspaces
/ create-workspace) and correctly has no workspace to scope to.

`requireWorkspaceAccess` also accepts `{ feature }` and delegates to
`assertFeature`, so tenancy and entitlement are checked in one place.

### 3.4 Entitlements — working, server-enforced

`lib/plans/catalog.ts` defines 4 canonical plans, 8 limit keys, 22 feature
keys. `lib/plans/entitlements.ts::hasFeature` resolves
workspace override → plan `FeatureFlag` row → canonical catalog → denied. The
catalog fallback is deliberate and documented: an unseeded flag degrades to
the correct answer rather than to "off".

`assertFeature` throws **402**, not 403 — the client should offer an upgrade.
This is the seam V3's new feature keys must plug into.

### 3.5 Custom domains — substantially complete (contradicts `docs/AUDIT.md`)

`docs/AUDIT.md` says "Domain verification currently records state but does not
yet perform DNS/TLS checks." **That is no longer true.**
`lib/domains/service.ts` performs:

- real `dns.resolveTxt` ownership verification against `_tripistic.<host>`,
- real `dns.resolveCname` against the expected CNAME target,
- Cloudflare Custom Hostname create/get/remove
  (`lib/domains/provider.ts::CloudflareHostnameProvider`) including
  `ownership_verification`, `ownership_verification_http` and `ssl.status`,
- a `ManualHostnameProvider` fallback when Cloudflare env is absent,
- an apex strategy (TXT + provider health, then 308 redirect to `www.`),
- `pollCustomDomainHealth()` driven by `POST /api/admin/domains/poll` behind
  `DOMAIN_CRON_SECRET`.

Takeover protections present: `isPlatformHostname` rejection, reserved
subdomain list, IP/localhost rejection, unique `hostname` with a cross-workspace
conflict check.

**Genuine remaining gaps:** (a) nothing binds a domain to a *site*, only to a
workspace; (b) the Cloudflare provider is zone-scoped only — there is no
account-level Workers-for-Platforms fallback origin; (c) `ProviderHostname`
lives inside `lib/domains` rather than a shared Cloudflare client, so the AI /
Workers work would duplicate the API-envelope handling.

### 3.6 Storefront — working but shallow

`lib/storefront/schema.ts` is a single fixed-shape Zod object: brand + one
hero + four fixed page blocks + SEO. It has a genuinely good WCAG AA contrast
check on publish. `WorkspaceStorefront` + `WorkspaceStorefrontRevision` give
draft/published/version history.

**Limitation for V3:** it is not a page builder. There is no page list, no
ordered section array, no component library, no per-breakpoint control, no
deployment artifact. V3's Site Builder is a new model alongside it, not an
edit of it.

### 3.7 Payments — working

Stripe 22.3.1, Checkout Sessions created server-side, raw-body signature
verification, append-only `PaymentEvent` with idempotency, Connect destination
charges with a configurable platform fee (`TRIPISTIC_PLATFORM_FEE_BPS`,
defaulting to 0), refunds and disputes modelled, pending-payment expiry that
releases capacity atomically.

### 3.8 Booking engine — working

Atomic capacity reservation via parameterised `$queryRaw` plus database CHECK
constraints (`20260710193000_availability_capacity_constraints`,
`20260715221200_phase5_12_check_constraints`). Public booking creation is
idempotent and confirmation pages use high-entropy public tokens.

### 3.9 AI — **not implemented**

This is the largest greenfield area.

- `AiProviderConfig` model + `/admin/ai-providers` page + `GET
  /api/admin/ai-providers` exist. They are configuration storage and a
  read-only admin list. Nothing calls a model.
- `app/api/workspaces/[id]/business-brain/route.ts` and
  `app/dashboard/ai-growth` are **deterministic analytics**, not LLM calls —
  verified by reading them. The naming is misleading.
- `.env.example` has `OPENAI_API_KEY` / `OPENROUTER_API_KEY` / `AI_GATEWAY_URL`
  / `AI_MODEL_DEFAULT` marked "placeholders only for now".
- There is no `lib/ai/`, no embeddings, no vector store, no conversation
  model, no tool layer, no usage metering beyond the `UsageMeter` table and an
  `ai_credits_monthly` plan limit that nothing decrements.

### 3.10 Cloudflare — one narrow integration

The only Cloudflare code in the repository is the Custom Hostname provider.
There is no shared client, no Workers API access, no dispatch namespace, no
R2, no Vectorize, no AI Gateway, no service-token signing.

### 3.11 Background jobs — working

`lib/jobs/{registry,runner,health}.ts` with `JobRun` rows, PostgreSQL advisory
locks (`pg_try_advisory_lock` via parameterised `$queryRaw`), retries and a
health view. `POST /api/jobs/run` is the entrypoint. New V3 async work
(indexing, publishing, domain polling) should register here rather than
inventing a second scheduler.

### 3.12 Security posture

Present:
- Baseline security headers in `next.config.ts`
  (`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options` scoped away from `/embed` on purpose).
- HSTS deliberately *not* set from the app, with a written rationale: the app
  answers on operator custom domains whose TLS it does not control.
- `lib/security/rate-limit.ts` — database-backed fixed-window limiter.
- `lib/observability/logger.ts` with redaction (`logger-redaction.test.ts`).
- No `eval`, `new Function`, `child_process`, or unsafe deserialisation
  anywhere in `app/`, `lib/`, `components/`.
- All raw SQL is tagged-template parameterised. Zero `$queryRawUnsafe` in
  application code (the only occurrence is in the test global-setup, against a
  table list read from `pg_tables`).
- `dangerouslySetInnerHTML` appears 3×: the theme bootstrap script (static
  string), JSON-LD (`JSON.stringify` output), and the markdown renderer for
  first-party MDX-ish content. None take user input.

Missing / to add in V3:
- **No Content-Security-Policy.** Named in the V3 brief and genuinely absent.
- No CSP nonce plumbing, which the theme bootstrap script will need.
- Rate limiting is applied to auth and a few public routes only; AI, publish,
  upload and domain-verification endpoints do not exist yet and must be
  covered from the start.
- No service-to-service authentication primitive (HMAC + nonce + replay
  window) — required before any Worker may call Tripistic.

---

## 4. Dead code / duplication found

- `lib/plans/limits.ts::isFeatureEnabled` and
  `lib/plans/entitlements.ts::hasFeature` implement the same resolution twice,
  with different fallbacks (`limits.ts` has no catalog fallback, so it returns
  `false` for unseeded flags). `hasFeature` is the correct one. `isFeatureEnabled`
  is still referenced and is left alone in this phase — changing it is a
  behavioural change that belongs in its own commit with its own tests.
- `tripistic-hostinger-deploy-20260728.zip` (2.8 MB) is committed at the
  repository root. It is a build artifact and should not be in git. Flagged,
  not removed — deleting it is a separate decision for the owner.
- Twelve strategy/marketing Markdown files sit at the repository root
  (`00_README.md` … `11_Execution_Checklist.md`) alongside a populated
  `docs/`. Cosmetic.

---

## 5. Integration points V3 must use (not replace)

| V3 need | Existing seam to use |
|---|---|
| Tenant scope | `requireWorkspaceAccess(userId, workspaceId, { feature })` |
| Plan gating | `assertFeature` / `hasFeature` + `PlanFeatureKey` in the catalog |
| Errors | `ApiError` + `handleApiError` (402 = upgrade, 404 = out-of-tenant) |
| Audit | `recordAuditEvent` |
| Logs | `lib/observability/logger` (redacting) + `REQUEST_ID_HEADER` |
| Async work | `lib/jobs/registry.ts` |
| Rate limits | `lib/security/rate-limit.ts` |
| Hostname routing | `middleware.ts` + `lib/domains/host.ts` |
| Media | `WorkspaceMediaAsset` + `lib/media` upload-intent flow |
| Domain lifecycle | `lib/domains/service.ts` (extend, do not fork) |

---

## 6. Schema changes V3 requires

New models (all `workspaceId`-scoped, all with tenant-safe composite indexes):

- Site Builder: `Site`, `SitePage`, `SiteRevision`, `SiteDeployment`
- Knowledge/RAG: `KnowledgeSource`, `KnowledgeDocument`, `KnowledgeChunkRef`,
  `KnowledgeIndexJob`
- AI: `AiConversation`, `AiConversationMessage`, `AiUsageEvent`
- Edge auth: `ServiceRequestNonce` (replay prevention)
- x402: `X402Payment`, `X402AccessGrant`

Changed models:

- `CustomDomain` gains a nullable `siteId` so a hostname can point at a
  specific site rather than only at the workspace.

Migration risk is low: every change is additive, every new column on an
existing table is nullable. No backfill is required.

---

## 7. Migration risks

1. **`prisma migrate dev` must not run against production.** The repo already
   uses `prisma migrate deploy` in `db:migrate`. Keep it.
2. **Vectorize deletes are not transactional with PostgreSQL.** Deleting a
   knowledge source must delete vectors *after* the row commits and must be
   retryable, or a failed delete leaves orphaned vectors that are still
   retrievable. This is a correctness-and-isolation issue, not just tidiness.
3. **Workers-for-Platforms scripts are not in the database.** A deployment
   record can drift from the actual uploaded script. The deployment row must
   be written only after a successful upload plus health check.
4. **The `ai_credits_monthly` limit already exists in every seeded plan** and
   currently decrements nothing. Turning on enforcement changes behaviour for
   existing workspaces on day one; it must be introduced with a warning
   threshold and an admin override.

---

## 8. Conclusion

Tripistic 2.0.0 is a genuinely production-shaped application: one system of
record, one tenancy guard, server-enforced entitlements, atomic capacity,
signed webhooks, real DNS/TLS verification, a job runner with advisory locks,
and 609 passing tests. It is not a scaffold.

The V3 work is therefore additive by nature. The three real greenfield areas
are **AI/RAG**, **Workers for Platforms**, and the **Site Builder**; the
Cloudflare and domain work is mostly *extraction and completion* of code that
already exists. Nothing in the brief requires rewriting a working subsystem,
and this implementation does not.
