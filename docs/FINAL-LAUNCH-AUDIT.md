# Tripistic — Final Launch Pre-Implementation Audit

**Audit date:** 2026-07-29
**Branch audited:** `claude/tripistic-app-audit-txfxh6`
**Starting commit SHA:** `e3a30d3114a54033e04a066ed3bba0ad900b3d5b`
**Relationship to default branch:** identical to `origin/main` (0 commits ahead, 0 behind)
**Auditor scope:** evidence-based inspection only. No application file was modified during this audit.

> **Method.** Every claim below is derived from reading the code in this repository, from
> commands executed against a real PostgreSQL 16 instance, or from the project's own CI
> history. Where a previous document asserts something this audit could not reproduce, the
> discrepancy is stated explicitly. Claims that could not be verified are marked
> **UNVERIFIED** rather than assumed.

---

## 1. Executive summary

Tripistic is a substantial and, in its core transactional path, **genuinely well-engineered**
multi-tenant SaaS. Tenant isolation is sound across all 78 workspace-scoped API handlers,
booking capacity reservation is atomically correct and proven under concurrent load, and
payment confirmation is never derived from a success redirect. These are the hardest things
to get right, and they are right.

The application is nonetheless **not launch-ready**. The gap is not in the domain logic; it is
in the operational envelope around it:

1. **CI has been failing on `main` for every commit since 2026-07-25.** The last green build
   was 2026-07-16. This audit reproduced the failure locally and identified the root cause.
2. **A fresh production deployment never seeds the plan catalog**, which cascades into an
   empty billing page, workspaces with no subscription, and every entitlement gate returning 409.
3. **The application ships no scheduler**, so five categories of recurring work — including the
   sweep that releases seats from abandoned checkouts — will never execute in production.
4. **Password reset and email verification do not exist.** A user who forgets their password
   has no recovery path.
5. **No security headers, no rate limiting, no health endpoint, and no maintenance enforcement.**

There is also a distinct and serious problem that is *not* an engineering gap. **The product
code is markedly more honest than the website describing it.** The dashboard says plainly that
no AI provider is called; the marketing site sells an "AI Travel Operating System" with an "AI
Copilot" and "AI Reports" that do not exist. The developer documentation instructs users to
create API keys in a settings screen that has no backing model, no UI, and no bearer-auth path.
The homepage carries three named customer testimonials that are fabricated and undisclaimed.
These are itemised in §15 and are treated here as launch blockers on honesty and regulatory
grounds, independent of their engineering cost — several are pure copy fixes and are among the
cheapest items on the list.

**Verdict: not production ready.** Nine of the eighteen mandatory launch gates currently fail,
and five more cannot be verified without production access.

---

## 2. Baseline and validation gates — measured, not assumed

All commands were run at `e3a30d3` against Node 22 and a disposable PostgreSQL 16 instance
created for this audit.

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Clean dependency install | `npm ci` | **PASS** — exit 0 | lockfile honoured, `prisma generate` postinstall succeeded |
| Schema validation | `npx prisma validate` | **PASS** (with `DATABASE_URL` set) | see note below |
| Schema formatting | `npx prisma format --check` | **PASS** — "All files are formatted correctly" | |
| Fresh-database migration | `npx prisma migrate deploy` | **PASS** — 19 migrations applied, 60 tables created | |
| Seed | `npm run db:seed` | **PASS** — 4 plans upserted, idempotent | |
| Lint | `npm run lint` | **PASS** — 0 errors, 0 warnings | |
| Typecheck | `npx tsc --noEmit` | **PASS** — 0 errors | |
| Unit tests | `npm run test:unit` | **PASS** — 74 passing across 9 files | |
| **Integration tests** | `npm run test:integration` | **FAIL — 6 failed / 155 passed (161), 2 failed files** | §3 |
| Production build | `npx next build` | **PASS** — exit 0 | |
| E2E (Playwright) | `npm run test:e2e` | **UNVERIFIED** — not executed in this environment | |
| Dependency audit | `npm audit --omit=dev` | **PASS** — 0 vulnerabilities | |

**Note on `prisma validate`:** the command fails with `P1012 Environment variable not found:
DATABASE_URL` when no `.env` is present. This is an environment gap, not a schema defect — the
schema is valid once the variable is set. CI sets it at `.github/workflows/ci.yml:9`, so this
does not affect CI. It does mean a developer following `README.md` without creating `.env`
first will hit a confusing error.

---

## 3. LAUNCH BLOCKER P0-1 — CI is red on `main` and has been for two weeks

### Evidence

GitHub Actions history for `ci.yml` (`Shubochandrosarker/tripistic`):

| Date | Branch | SHA | Conclusion |
|---|---|---|---|
| 2026-07-28 | main | `e3a30d31` | **failure** ← current HEAD |
| 2026-07-28 | main | `01a2e515` | **failure** |
| 2026-07-25 | main | `15cf7633` | **failure** |
| 2026-07-25 | claude/…-website | `9f94cb4a` | **failure** |
| 2026-07-25 | claude/…-website | `51c23ca8` | **failure** |
| 2026-07-25 | main | `3e7b6ad6` | **failure** |
| 2026-07-25 | main | `44cfa297` | **failure** |
| 2026-07-16 | main | `833aa735` | success ← last green build |

The CI job log for the current HEAD reports `Test Files 2 failed | 22 passed (24)` and
`Process completed with exit code 1`, with these assertions:

- `AssertionError: expected 409 to be 201`
- `AssertionError: expected 409 to be 200`
- `TypeError: Cannot read properties of undefined (reading 'reference')`

This audit **reproduced the identical failure locally** — same 2 files, same 6 tests, same
assertions:

```
FAIL tests/integration/payment-flow.test.ts  (5 tests)
FAIL tests/integration/messaging.test.ts     (1 test)
Test Files  2 failed | 22 passed (24)
     Tests  6 failed | 155 passed (161)
```

### Root cause

The Stripe Connect work (migration `20260727110000_stripe_connect_payments`) added a hard
precondition to paid-booking creation. `lib/payments/service.ts:60` calls
`getChargeReadyPaymentAccount(booking.workspaceId)`, which throws HTTP 409 unless the workspace
has a `WorkspacePaymentAccount` row with `chargesEnabled && payoutsEnabled && status ===
"enabled"` (`lib/payments/connect.ts:219-225`).

The pre-existing payment and messaging integration tests were written before Connect existed
and never create such a row — confirmed by grep: neither `tests/integration/payment-flow.test.ts`
nor the shared helpers reference `paymentAccount`, `WorkspacePaymentAccount`, or
`chargesEnabled`. Every paid-booking assertion therefore now receives 409 where it expects
201/200, and the two downstream tests then dereference an undefined booking.

### Assessment

The production code is arguably **correct** here — refusing to take money when there is no
ready payout destination is the right behaviour. The defect is that the test suite was not
updated alongside it, and that seven subsequent commits were merged to `main` on a red build.

This must be fixed before anything else, because **a red baseline makes every other gate
unverifiable**. The fix is to seed a charge-ready `WorkspacePaymentAccount` in the affected
test fixtures; it is a test-side change, not a production behaviour change.

---

## 4. LAUNCH BLOCKER P0-2 — production deploys never seed the plan catalog

### Evidence chain

`docker/entrypoint.sh`, in full — four lines, verified directly:

```sh
#!/bin/sh
set -eu

exec "$@"
```

It performs no migration, no seeding, no env validation. `Dockerfile:44` is
`CMD ["node", "server.js"]`.

Migrations *do* run, correctly ordered: `docker-compose.hostinger.yml:8-10` gates the app on
`migrate: condition: service_completed_successfully`, and `:34` runs `npm run db:migrate`
(`prisma migrate deploy`).

**Seeding does not.** It lives in a separate service behind a Compose profile —
`docker-compose.hostinger.yml:53-55` (`profiles: [tools]`), `:68` (`command: npm run db:seed`).
Profiled services do not start with `docker compose up`. `docs/HOSTINGER-VPS.md:110-118`
confirms this is a documented manual step.

No migration inserts plan rows (grep for `INSERT INTO` across `prisma/migrations/` finds no
plan seeding), and no application code upserts the catalog at runtime — there is no
`instrumentation.ts`.

### Blast radius of an empty `plans` table

| Surface | Behaviour | Evidence |
|---|---|---|
| `/dashboard/billing` plan grid | `plans.map()` over `[]` → empty grid, **no empty-state message** | `app/dashboard/billing/page.tsx:121-170` |
| `/dashboard/billing` current plan | "No subscription record found… contact support" | `app/dashboard/billing/page.tsx:107-112` |
| Workspace creation | `defaultPlan` null → workspace created with **no `Subscription` row** | `app/api/workspaces/route.ts:43-46,70-82` |
| All entitlement gates | `requireSubscription()` throws 409 → tour activation, invitations, custom domains all fail | `lib/plans/entitlements.ts:40-46` |
| `GET /api/plans` | `{plans: []}` | `app/api/plans/route.ts:7-22` |
| Public `/pricing` | **unaffected** — reads the static catalog | `lib/marketing/pricing.ts:19-32` |

The signature to expect in production is precisely the one previously reported: a working
public pricing page alongside a blank operator billing page.

### Secondary trap

Even a manual `docker exec … npm run db:seed` against the running app container will fail. The
runner stage (`Dockerfile:31-38`) copies only `.next/standalone`, `.next/static`, `public`,
`prisma/`, and the Prisma client. Both `tsx` and the `prisma` CLI are devDependencies and are
absent from the runtime image.

### Compounding: no subscription backfill

Only two code paths ever create a `Subscription` — workspace creation *if a default plan
exists* (`app/api/workspaces/route.ts:70`) and Stripe webhooks
(`lib/billing/webhook-service.ts:149,184`). No migration, script, or admin route backfills.
**Any workspace created before plans were seeded is permanently subscription-less.**

### Also blocking checkout

`.env.example:50-55` ships all six `STRIPE_PRICE_*` variables blank, and `prisma/seed.ts:81-90`
never writes `providerPriceId`. With both unset, `resolveStripeSubscriptionPriceId` throws 409
(`lib/billing/stripe-billing.ts:50-52`) — **SaaS checkout cannot complete at all** until the
price IDs are configured in the environment.

---

## 5. LAUNCH BLOCKER P0-3 — the application ships no scheduler

### Evidence

There is no scheduling infrastructure of any kind in this repository:

- No `vercel.json`.
- `.github/workflows/ci.yml` has no `schedule:` trigger.
- `docker-compose.hostinger.yml` defines `app`, `migrate`, `db`, `tooling` — no cron or worker service.
- `docker/entrypoint.sh` is `exec "$@"`; `Dockerfile:44` is `CMD ["node", "server.js"]`.
- `package.json` contains no `node-cron`, `bullmq`, `ioredis`, `agenda`, `pg-boss`, or `graphile-worker`.

The codebase is candid about this — `app/api/admin/payments/expire-pending/route.ts:8-10`
states: *"There is no in-process scheduler in this application — wiring a real interval trigger
… is a deployment-time task, not built here."* Same admission at
`app/api/admin/messages/sweep/route.ts:9-11` and `lib/messaging/reminders.ts:26`.

### Work that will therefore never run

| Job | Implementation exists | Trigger | Consequence if never run |
|---|---|---|---|
| Pending-payment expiry sweep | `lib/payments/expiration.ts:102-110` | `POST /api/admin/payments/expire-pending` | **Abandoned checkouts hold seats forever** |
| Custom-domain DNS/SSL reconciliation | `lib/domains/service.ts:265-295` | `POST /api/admin/domains/poll` | Domains never leave `pending_dns`/`ssl_pending` without manual clicks |
| T-24h departure reminders | `lib/messaging/reminders.ts:27-41` | `POST /api/admin/messages/sweep` | **No guest ever receives a reminder** |
| Failed-email retry | **does not exist** | — | A failed email is never retried |
| Subscription dunning / grace enforcement | **does not exist** | — | A past-due workspace keeps full access indefinitely |
| Trial expiry evaluation | **does not exist** | — | Trials never end |
| Host-cache invalidation | `cacheInvalidatedAt` written 7×, **read 0×** | — | A disabled domain keeps serving for the TTL |

### Compounding defect

Two of the three existing trigger endpoints are gated by `requirePlatformAdminApi()` — a
*session*-based guard (`lib/auth/guards.ts:18-21`). Even after wiring an external scheduler,
`expire-pending` and `messages/sweep` **cannot be called headlessly**, unlike
`/api/admin/domains/poll` which already accepts a cron secret
(`app/api/admin/domains/poll/route.ts:4-10`). That asymmetry must be resolved as part of the fix.

---

## 6. LAUNCH BLOCKER P0-4 — booking, payment, and inventory correctness holes

The reservation path itself is correct (§9). These are defects in the paths *around* it.

### 6.1 A declined payment holds its seats permanently

`markPaymentFailed` sets the payment to `failed` and deliberately leaves the booking `pending`
(`lib/payments/webhook-service.ts:114-131`). But `findExpiredPendingPaymentIds` only selects
payments in `requires_payment` or `processing` (`lib/payments/expiration.ts:87`).

A booking whose only payment attempt declined is therefore an **unreleasable seat hold** — no
code path can ever free it, not even the sweep from §5, and only a manual operator cancellation
recovers the inventory.

### 6.2 Paid-after-cancel is unrecoverable and loops Stripe retries forever

If a booking is cancelled (by expiry sweep or operator) and a `succeeded` webhook then arrives:

1. `confirmPaymentAndBooking` attempts `cancelled → confirmed`
   (`lib/payments/webhook-service.ts:93-99`).
2. That transition is not permitted (`lib/bookings/status.ts:17`), so `conflict()` is thrown
   (`lib/bookings/status-service.ts:62-64`).
3. The throw rolls back the **entire transaction, including the `PaymentEvent` idempotency
   row**, and the route returns 409.
4. Stripe retries. Every retry fails identically.

Net result: **money captured, booking cancelled, seat given away, no reconciliation record, and
a permanently failing webhook.** This is the single most damaging correctness defect found.

### 6.3 A refund releases nothing

Neither `lib/payments/refunds.ts:90-96` nor `markPaymentRefunded`
(`lib/payments/webhook-service.ts:138-157`) touches booking status or availability — the latter
comments explicitly *"Deliberately does not touch booking status."*

Because `BookingStatus` has no `refunded` or `partially_refunded` value
(`prisma/schema.prisma:132-140`), a fully-refunded booking is **indistinguishable from a paid
one** on the operations board and still occupies a seat and a manifest slot until an operator
separately cancels it.

### 6.4 Stale payment rows can cancel a live checkout

`createCheckoutSessionForBooking` always inserts a *new* `Payment` row
(`lib/payments/service.ts:104`) without settling the previous one, and
`checkout.session.expired` is unhandled (falls through to `default:` at
`lib/payments/webhook-service.ts:329-334`). After a retry, the old row remains
`requires_payment` with a past `expiresAt`. Once the sweep from §5 is wired up, it will match
that stale row and cancel a booking whose guest is mid-payment on a valid session — feeding
directly into 6.2.

### 6.5 Platform fee stored at 100× actual for zero-decimal currencies

`lib/payments/service.ts:61` computes and persists `platformFeeAmount` from
`booking.totalAmount` (stored minor units), while `lib/payments/connect.ts:234-235` computes
the fee Stripe actually charges from `toStripeAmount(...)`. For zero-decimal currencies
(JPY, KRW, VND — `lib/constants.ts:275-278`) these differ by 100×. Revenue reporting on those
currencies is wrong.

### 6.6 No currency-consistency guard

`getChargeReadyPaymentAccount` (`lib/payments/connect.ts:219-225`) checks onboarding flags but
never compares `account.defaultCurrency` to `booking.currency`. A tour priced in a currency the
connected account cannot settle fails only at Stripe — *after* a `pending` booking has already
taken the seats.

### 6.7 Missing entities

- **Coupons / promo codes: entirely absent.** Zero schema or code hits for
  `coupon|discount|promo|voucher`. The master prompt's coupon race-condition test is therefore
  not applicable, but the feature gap should be an explicit product decision.
- **Guest-facing taxes and fees: absent.** `Booking.totalAmount = subtotal + addonsTotal`
  (`lib/bookings/service.ts:198`). `Payment.platformFeeAmount` is the platform's Connect take,
  not a guest-visible fee.
- **Price variants (adult/child, tiered, group): absent.** One `unitPrice` per booking.
- **No money CHECK constraints.** Only `plan_prices_amount_nonnegative` and
  `vendor_invoices_amount_nonnegative` exist. There is no `payments_amount_nonnegative` and no
  `refunded_amount <= amount`.

### 6.8 Timezone rendering defect

Departure generation is correctly timezone-aware via `@date-fns/tz`
(`lib/tours/schedule.ts:51-59`, with a documented DST guarantee at `:12`). But the guest
confirmation page formats the departure with `Intl.DateTimeFormat("en-US", …)` and **no
`timeZone` option** (`app/book/confirmation/[publicToken]/page.tsx:32-39`) — it renders in the
*server's* timezone, not the workspace's. The correct helper `formatDateTimeInTz` exists
(`lib/utils.ts:53-72`) and is used by emails but not here.

---

## 7. LAUNCH BLOCKER P0-5 — authentication and account lifecycle gaps

| Capability | Status | Evidence |
|---|---|---|
| Registration, login, logout | **EXISTS** | `app/api/auth/register/route.ts:7-37`; `lib/auth/auth.ts:12-47` |
| **Email verification** (send/confirm/resend/throttle) | **MISSING — all four** | `User.emailVerifiedAt` (`prisma/schema.prisma:209`) is written only by seeds and test helpers, and **read by nothing**. An unverified email can log in and operate. |
| **Forgot password / reset** | **MISSING entirely** | No token model in the schema, no route, no page. Grep for `forgot.?password\|reset.?password\|resetToken` returns **zero hits** repo-wide. |
| **Change password** | **MISSING** | `hashPassword` has exactly one caller: registration. |
| **Change email** | **MISSING** | `GET /api/me` is read-only; there is no `PATCH`. |
| Workspace invitation (create/accept/expire/revoke) | **EXISTS** — well built | `app/api/workspaces/[id]/invitations/route.ts:58-145`; `app/api/invitations/[token]/accept/route.ts:11-87` |
| **Ownership transfer** | **PARTIAL / structurally broken** | Role can be reassigned, but `Workspace.ownerId` (`prisma/schema.prisma:252`) is written **only at creation** (`app/api/workspaces/route.ts:57`). `ownerId` and the `workspace_owner` role drift permanently, and `owner` is `onDelete: Restrict`. |
| **Account deletion / data export** | **MISSING** | No `DELETE /api/me`, no workspace deletion, no export. `User.deletedAt` is read but never written. **The public legal pages advertise GDPR/CCPA rights the product cannot fulfil.** |

**No password reset is on its own a launch blocker**: any user who forgets their password is
permanently locked out with no self-service recovery.

### Related auth findings

- **No rate limiting or lockout** on login or registration (§8).
- **Registration is an email-enumeration oracle** — returns 409 "An account with this email
  already exists" for any probed address (`app/api/auth/register/route.ts:12-15`).
- **Invitation tokens are stored in plaintext** (`prisma/schema.prisma:356`) and looked up by
  raw value. A leaked backup yields directly replayable 7-day workspace-join credentials.
- **No session expiry policy and no revocation.** JWT strategy with no `maxAge`
  (`lib/auth/config.ts:13-15`) means 30-day rolling tokens. Because `getCurrentUser()`
  re-queries the DB (`lib/auth/session.ts:18-25`), a status flip or soft-delete does lock a user
  out — but a password change would not. This becomes acute the moment password reset ships.
- **No seat re-check at invitation accept time** — `assertCanReserveSeat` runs only at invite
  (`.../invitations/route.ts:73`), so N invites issued under the limit can all be accepted
  after the plan's seats fill.

---

## 8. LAUNCH BLOCKER P0-6 — security hardening is absent

### 8.1 Security headers — all six missing

`next.config.ts` is eight lines and contains **no `headers()` function**:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
};
```

`middleware.ts` sets no response headers — it only rewrites, redirects, or calls
`NextResponse.next()`. A repo-wide grep for
`Content-Security-Policy|X-Frame-Options|Strict-Transport|Referrer-Policy|Permissions-Policy|X-Content-Type-Options|frame-ancestors`
returns **zero hits**.

Missing: CSP, HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy,
Permissions-Policy. Present: `poweredByHeader: false`.

> **Critical implementation constraint.** `app/embed/[workspaceSlug]/[tourSlug]/page.tsx:15` is
> a deliberately iframe-embeddable booking widget. Because there is currently *no* frame
> protection, embeds work — but there is also no exemption mechanism. Adding a blanket
> `X-Frame-Options: DENY` or `frame-ancestors 'none'` **will silently break every customer's
> embedded booking widget.** Any header work must path-scope `/embed/**` from the outset. Note
> also that `shouldBypassHostRewrite` (`lib/domains/host.ts:83-98`) does not list `/embed`.

### 8.2 Rate limiting — none, while the public docs promise it

There is genuinely zero in-app rate limiting; the README states this is deliberate and
delegated to a WAF/CDN (`README.md:76`). That is a defensible architecture choice. Two things
make it a blocker anyway:

1. **No WAF/CDN configuration is committed.** No `wrangler.toml`, no Terraform, no Cloudflare
   ruleset. The nginx/Caddy samples at `docs/HOSTINGER-VPS.md:66-99` contain no `limit_req`
   zone. The mitigation exists only as prose.
2. **The public API documentation promises limits the app never enforces.**
   `content/docs/api.md:148-150` and `content/developers/rate-limits.md:37-42` document
   `X-RateLimit-Limit/Remaining/Reset` headers and 429 semantics;
   `public/openapi.json:544-550` declares a `RateLimited` response. None of these headers are
   ever emitted — `lib/api.ts:43-71` sets only `Cache-Control`.

Unprotected endpoints of concern: login (`lib/auth/auth.ts:12-47` — unlimited bcrypt attempts),
registration, public booking creation, marketing contact, newsletter subscribe, and the
unauthenticated token-only payment retry.

### 8.3 Maintenance mode is not enforced

The `MaintenanceSetting` model (`prisma/schema.prisma:2209`), the admin API
(`app/api/admin/maintenance/route.ts`), and the admin UI all exist. **Nothing reads the flag at
request time.** `middleware.ts` never imports Prisma and returns `NextResponse.next()`
unconditionally.

The code says so itself — `app/admin/maintenance/page.tsx:56`: *"The runtime enforcement hook is
intentionally centralized here for the next middleware pass."* Toggling maintenance mode on
currently changes one boolean on an admin dashboard and nothing else.

### 8.4 CSRF / origin validation

Mutations are JSON API routes, not Server Actions (exactly one `"use server"` exists repo-wide).
There is **no CSRF token** (grep: 0 hits) and **no Origin/Referer validation** (grep: 0 hits).
The auth cookie's `sameSite` is never configured in code — Auth.js v5 defaults (`lax`) apply
implicitly.

Protection today rests entirely on `SameSite=Lax` plus JSON content-type forcing a preflight.
That is *probably* adequate for the current route shapes, but it is undocumented, unasserted,
and has no defence in depth.

### 8.5 What is genuinely solid

Worth preserving as-is: Stripe webhook signature verification over the raw body
(`app/api/stripe/webhook/route.ts:19-29`); consistent zod validation at API boundaries (every
mutation route audited — no unvalidated body reaches a write); **all four raw SQL sites
parameterized via tagged templates and tenant-scoped**, with zero `$queryRawUnsafe` in
production code; upload type/size schema with UUID storage keys making path traversal
structurally impossible (`lib/media/service.ts:33-34`); no SSRF surface; no secrets logged.

---

## 9. Verified strengths — do not rewrite these

This section exists so that remediation does not damage what already works.

### 9.1 Tenant isolation — no IDOR found

All **78** `[id]`-scoped handlers under `app/api/workspaces/**` call `requireUserApi()` then
`requireWorkspaceAccess()` before any read or write. A mechanical scan found exactly one file
without the guard — `app/api/workspaces/route.ts` — which is not a finding, because it derives
its list from verified memberships and its POST creates a new workspace.

`requireWorkspaceAccess` (`lib/tenancy/workspace.ts:65-77`) throws **404, not 403**, so
out-of-tenant existence is not leaked. The active-workspace cookie is intersected against the
verified membership list (`:51`), so a forged cookie cannot select a foreign workspace. Nested
IDs are re-scoped via composite keys, not just the top-level ID.

The schema reinforces this with composite tenant foreign keys — e.g.
`Booking.availability` references `(workspace_id, id)` (`prisma/schema.prisma:822`).

> **One defect in an otherwise clean model.** `requireWorkspaceAccess` filters only
> `deletedAt: null` (`lib/tenancy/workspace.ts:71`), while `getMemberships` additionally
> excludes archived workspaces (`:19`). **A suspended or archived workspace therefore still
> accepts full API reads and writes** — only the UI workspace-switcher hides it. Non-payment
> suspension is consequently unenforceable at the API layer, which compounds the past-due
> entitlement gap in §12. This is a one-line fix and is listed as traceability item 15.

A structural caveat worth noting: role and tenancy checks live in the route handlers rather
than in a shared wrapper. They are applied consistently across all 78 handlers today, but
there is **no structural guarantee that a newly added handler will include one**. A lint rule
or a route-level test harness would make this durable.

### 9.2 Booking capacity reservation — atomically correct

The README claim is accurate. `lib/bookings/service.ts:205-215` performs a single
tagged-template `UPDATE … WHERE booked_count + n <= capacity … RETURNING id` inside a
transaction; zero rows returned yields 409. The earlier `findFirst` is advisory only — every
condition it checks is re-asserted in the `UPDATE`'s `WHERE`.

Database CHECK constraints enforce the same invariant independently of application code
(`prisma/migrations/20260710193000_availability_capacity_constraints/migration.sql:7-14`).

This is proven under real concurrent load: `tests/integration/booking-concurrency.test.ts:31-60`
races 12 concurrent bookers for 3 seats and asserts exactly 3 win.

### 9.3 Payment confirmation truth — clean

A booking is confirmed in exactly three places, none of them a redirect: a verified webhook
(`lib/payments/webhook-service.ts:70-107`), an operator transition
(`lib/bookings/status-service.ts:111-143`), and free bookings only where `totalAmount === 0`.
The `?payment=success` query param is set but **never read anywhere**. No path confirms an
unpaid booking.

### 9.4 RBAC and super-admin separation

`lib/auth/permissions.ts` defines ~30 explicit capability checks rather than a role hierarchy.
Owner-only actions (billing checkout, portal, preview, plan change, and all four Connect
payout routes) are all enforced server-side. Self-protection and last-owner protection are
present on both demote and remove paths.

Platform admin is a DB column re-checked per request via `getCurrentUser()`
(`lib/auth/guards.ts:11,19`). All 11 authenticated `/api/admin/**` handlers are guarded; the
one exception (`domains/poll`) is a cron endpoint that **fails closed when its secret is unset**.
No impersonation feature exists — a deliberate non-feature, not an unfinished one.

### 9.5 Cloudflare custom-hostname integration is real

`lib/domains/provider.ts:81-133` makes genuine authenticated calls to
`api.cloudflare.com/client/v4/zones/{zone}/custom_hostnames`. DNS verification is real —
`lib/domains/service.ts:60-76` performs actual `dns.resolveTxt` and `dns.resolveCname` lookups
against the stored token. This is not a stub.

### 9.6 Deployment fundamentals

Non-root container user (`Dockerfile:29-31,41`), multi-stage build discarding build tooling,
correct migration ordering via `service_completed_successfully`, idempotent migrations and seed,
Postgres healthcheck and persistent volume, `.dockerignore` secret exclusion with explicit
allowlisting. Graceful shutdown works implicitly because `exec` makes Node PID 1.

---

## 10. Reliability and observability gaps

| Capability | Status | Evidence |
|---|---|---|
| `/api/health` liveness/readiness endpoint | **MISSING** | No `app/api/health/` directory. `app/admin/system-health/page.tsx` is an authenticated page, not a machine-readable probe. |
| App-container `HEALTHCHECK` | **MISSING** | Neither `Dockerfile` nor the `app` service defines one. Only `db` has a healthcheck (`docker-compose.hostinger.yml:47-51`). `restart: unless-stopped` only restarts on process exit — **a hung-but-alive process is never detected or recycled.** |
| Structured logging | **MISSING** | No logger dependency. Eight raw `console.*` calls. `LOG_LEVEL` is declared in both env examples and **read by nothing**. |
| Request/correlation IDs | **MISSING** | Grep returns 0 hits. Errors cannot be tied to a request. |
| Error monitoring (Sentry/Datadog) | **MISSING** | 0 hits; no `instrumentation.ts`. |
| Startup env validation | **MISSING** | No `lib/env.ts`. `DATABASE_URL` and `AUTH_SECRET` both **fail late**, at first use, after the container reports healthy. |
| Backup automation | **PARTIAL** | A single manual `pg_dump` line at `docs/HOSTINGER-VPS.md:129-135`. No schedule, offsite copy, retention, encryption, or restore rehearsal — against a customer-facing **"35-day backup retention"** claim at `content/legal/security-policy.md:33`. |
| Rollback runbook | **MISSING** | The only "Rollback" heading (`docs/LAUNCH-CHECKLIST.md:185-189`) scopes itself to marketing content. Application/image rollback is undocumented; `docs/HOSTINGER-VPS.md:120-127` is forward-only `up -d --build` with no tagged images. |
| Post-deploy smoke test | **MISSING** | `scripts/` holds only CI test runners, which require a `tripistic_test` database and are hard-guarded against running elsewhere. |

Net: **the audit log is the only durable observability signal.** A production 500 is diagnosable
only via `docker compose logs`.

Additional CI note: `npm audit` is explicitly non-blocking —
`run: npm audit --audit-level=critical || true` (`.github/workflows/ci.yml:88`) — and there is
no deploy job; deployment is entirely manual.

---

## 11. Correctly priced: the Solo plan is $29/month

Verified end-to-end against a live seeded database:

```
 name |  slug | price_monthly | price_yearly | currency
 Solo |  solo |          2900 |        27800 | USD
```

`lib/plans/catalog.ts:84-89` defines `monthlyPriceCents: 2900`. Units are consistently cents
across the schema (`Plan.priceMonthly Int`), the seed, `formatMoney()` (`lib/utils.ts:18-28`),
and the marketing surface (`lib/marketing/pricing.ts:22-23`). **No cents/dollars mismatch was
found anywhere.**

Full seeded catalog: Solo $29/mo · Operator $149/mo · Agency $399/mo · Enterprise (contact sales).

The Solo entitlement set matches the intended packaging — 1 workspace, 1 seat, 20 active tours,
1 custom domain, 100 AI credits/month, 5 GB storage, unlimited bookings. Plan features and
limits are centrally defined in `lib/plans/catalog.ts` and seeded idempotently, satisfying the
"do not hard-code entitlements in scattered components" requirement at the definition layer.

**However**, the Solo feature list advertises capabilities that §12, §13, and §15 show are not
fully delivered: *"1 custom domain with managed SSL"* (SSL gate bypassable in the default
provider mode), *"White-label storefront"* (no write path exists), and *"Basic AI copilot"* (a
rule engine). The pricing comparison table additionally ticks *"REST API and webhooks"* on this
plan, which contradicts both the code and the plan's own `api_access: false` flag. Those claims
must be implemented or amended before the plan is sold.

Notably, the pricing page and the seed **cannot drift** — both derive from `canonicalPlans` in
`lib/plans/catalog.ts`, so the $29 figure is correct by construction on both surfaces. This is
good design and should be preserved.

---

## 12. Entitlements are defined but almost entirely unenforced

A central entitlement service exists (`lib/plans/entitlements.ts`) with `evaluateLimit`,
`readLimit`, `requireSubscription`, and three usage/assert pairs. **It has only three
enforcement call sites in the entire codebase:**

1. `app/api/workspaces/[id]/invitations/route.ts:73` — seat limit ✅
2. `app/api/workspaces/[id]/tours/[tourId]/route.ts:82` — active-tour limit ✅
3. `lib/domains/service.ts:118` — custom-domain limit ✅

### Unenforced

- **All 22 feature flags.** `isFeatureEnabled()` (`lib/plans/limits.ts:19`) has **zero callers**
  repo-wide. Every flag — `white_label`, `custom_domain`, `crm_pipeline`, `guide_scheduling`,
  `operations_dispatch`, `vehicles`, `suppliers`, `itinerary_builder`, `advanced_ai`,
  `api_access`, `audit_logs`, `sso_saml` — is seeded and then never consulted. **A Solo
  workspace can call the CRM, operations, supplier, and itinerary APIs directly.**
- **`ai_credits_monthly`** — unenforced and unmeasured. The `UsageMeter` model
  (`prisma/schema.prisma:549-565`) has **no reads or writes anywhere**.
- **`workspaces` limit** — `POST /api/workspaces` never checks. A Solo user (limit: 1) can
  create unlimited workspaces, each spawning its own trial subscription.
- **`storage_gb`** — no consumer of the key exists.
- **Past-due access** — `graceEndsAt` is written (`lib/billing/webhook-service.ts:224`) but
  never enforced, and `past_due` is treated as a fully entitled status (`lib/plans/limits.ts:13`).
  **A workspace that stops paying keeps full access indefinitely.**

### Subscription lifecycle gaps

Checkout, portal, proration preview, activation, renewal, scheduled plan change, and
past-due marking all exist and are wired to webhooks. Missing or partial:

- **Trial**: local-only. `createBillingCheckoutSession` sets **no `trial_period_days`**
  (`lib/billing/stripe-billing.ts:87-109`) — Stripe bills immediately, despite the product
  promising a 14-day trial. No `trial_will_end` handler.
- **Immediate upgrade**: only *scheduled* change at period end, with
  `proration_behavior: "none"`. The preview computes prorations that are never charged.
- **Cancel-at-period-end**: synced from Stripe and stored, but there is **no API to set it** and
  it is **never rendered** on the billing page. Cancellation is Stripe-portal-only.
- **Reactivation**: missing entirely.
- **`unpaid`/`incomplete`/`incomplete_expired`** are all collapsed into `past_due`
  (`lib/billing/webhook-service.ts:44-48`) — the app cannot distinguish a failed card from an
  abandoned SCA.
- **Reconciliation job**: missing (see §5).

### Webhook events are silently dropped when they cannot be resolved

`syncSubscriptionFromStripe` returns early if no workspace or plan resolves
(`lib/billing/webhook-service.ts:114,121`), as do `attachCheckoutSession`, `markFromInvoice`,
and `markSubscriptionSchedule`. **In every case the `BillingEvent` is still stamped
`processedAt` and the route returns 200**, so Stripe never redelivers and nothing re-scans.

Because `provider_price_id` is never seeded, plan resolution depends entirely on
`metadata.planSlug`. **Any subscription created outside app checkout — via the Stripe Dashboard,
or a plan swap made in the customer portal — carries no such metadata and is dropped permanently.**

---

## 13. Custom domains, storefront, and white-label

### 13.1 The manual-provider SSL bypass

`markDomainActive` enforces the SSL gate **only when `provider === "cloudflare"`**
(`lib/domains/service.ts:228-230`). The provider silently falls back to `ManualHostnameProvider`
whenever `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ZONE_ID` are unset
(`lib/domains/provider.ts:42-44,170`), and that provider hardcodes `sslStatus: "pending"` forever
(`:143`).

Consequence: in default manual mode, `verifyCustomDomain` can never reach `active`, yet an
operator can call `POST …/activate` and flip the domain to `active` with **zero TLS
verification**. This is the most likely production footgun in this area, and there is no UI
indicating which provider is live.

### 13.2 Host-routing risks

- `middleware.ts:34` trusts `x-forwarded-host` **unconditionally** — there is no trusted-proxy
  allowlist. A request to the platform origin carrying `X-Forwarded-Host: tenant-a.com` will be
  served tenant A's storefront. Content-only, but a cache-poisoning vector for any CDN keying on
  URL rather than Host.
- **Host cache has no invalidation.** `cacheInvalidatedAt` is written on every domain mutation
  (7 sites) and **read by nothing**. Disabling a domain keeps serving it for up to the TTL, per
  process, with no forced flush.
- If `HOSTNAME_CACHE_SECRET`/`CRON_SECRET` is unset, `resolveHostMappingFromEdgeCache` silently
  returns `{found:false}` (`lib/domains/edge-cache.ts:33-36`), degrading every custom domain to
  an uncached per-request DB query and **losing the apex→www 308 redirect entirely**.
- Both shared-secret comparisons use plain `!==`, not constant-time.
- `shouldBypassHostRewrite` exempts `/dashboard`, `/admin`, `/login`, `/api` — so a customer's
  custom domain also serves the full Tripistic control plane at those paths, unbranded.
- Two of the seven `CustomDomainStatus` enum values (`verifying`, `verified`) are **never
  assigned by any code path**.
- **No test coverage exists for domains or host routing at all.**

### 13.3 White-label is a data-model-only scaffold

`WorkspaceWhiteLabel` (`prisma/schema.prisma:2071-2092`) has **zero write paths repo-wide**. A
grep yields exactly three hits, all reads, all in admin surfaces. There is no create, update, or
upsert anywhere — not even in the seed. **The admin white-label page is read-only over a table
that nothing can populate**, and will always render *"No white-label brands configured yet."*

It is also unused by the features it claims to drive: email sender name comes from a
`WorkspaceSetting` row, the storefront reads a separate `WorkspaceStorefront` model, and
`loginHeadline`, `pdfFooter`, and `apiBrandName` have no consumer at all.
`getPublishedStorefrontBySlug` does `include: { whiteLabel: true }` and then never uses it.

Meanwhile `app/_host/[hostname]/layout.tsx:13,21` **hardcodes "Tripistic" in the header and
"Powered by Tripistic" in the footer** — on the paying customer's own white-label domain.

### 13.4 Storefront gaps

- On a custom domain **only `/` and `/tours/<slug>` resolve.** `/about`, `/contact`, `/faq`,
  `/terms`, `/privacy` all 404 (`app/_host/.../page.tsx:49,67,145`).
- No tenant `sitemap.xml` or `robots.txt` — both are bypassed to the platform's own.
- `brand.typography` and `brand.faviconUrl` are collected in the builder form and persisted, but
  **neither is rendered anywhere**.
- `--storefront-secondary` and `--storefront-accent` are set as CSS variables and referenced by
  no class.
- `seo.socialImageUrl` is applied on `/book/...` but **not** on the custom-domain route.
- The default policy body is placeholder text: *"Policy text is a template until confirmed by
  the operator."* (`lib/storefront/schema.ts:99`).

---

## 14. Transactional email

The email layer is `lib/messaging/` (bare nodemailer SMTP; no provider SDK).

| Email | Status |
|---|---|
| Booking confirmation, T-24h reminder, team invitation, review request, departure delayed | **EXISTS** |
| **Email verification** | **MISSING** |
| **Password reset** | **MISSING** |
| **Booking cancellation** | **MISSING** |
| **Payment receipt** | **MISSING** |
| **Billing problem / dunning** | **MISSING** — `graceEndsAt` is only ever *displayed*; the customer is never emailed |
| **Domain activation/failure** | **MISSING** |

### Delivery characteristics

- **Synchronous and inline in the request.** `sendTrackedEmail` is awaited on the request path
  at every call site — including inside booking creation (`lib/bookings/service.ts:117`) and the
  Stripe webhook handler (`lib/payments/webhook-service.ts:396`).
  `sendDepartureDelayedNotices` loops bookings **sequentially** with an awaited SMTP round-trip
  each — a 50-guest departure serialises 50 SMTP handshakes inside one HTTP request.
- **No retry, no backoff.** The `Message` model has no attempt counter and no `nextRetryAt`.
  A `failed` row is terminal and nothing ever re-reads it.
- **No dedup on booking confirmation.** A booking transitioned `confirmed → cancelled →
  confirmed` sends a duplicate. The schema comment claims each send-site checks the dedupe
  index; that half of the claim is not true in code.
- **Graceful degradation with SMTP unset works correctly** — the app boots and every non-email
  path completes. But the failure is **invisible to the operator**: no admin surface lists
  failed messages and there is no alerting.
- Templates are table-based with plain-text alternatives (good), but have no media queries, no
  viewport meta, and **no tenant branding whatsoever** — no logo, no colours, no white-label
  lookup.

---

## 15. LAUNCH BLOCKER P0-7 — the marketing site sells what the product does not do

This section is the most commercially dangerous part of the audit, and also the cheapest to fix.

**The application code is honest.** `lib/analytics/business-brain.ts:13-20` states in its own
header that it is *"never an LLM call (no AI provider is configured anywhere in this
codebase)"*. `app/dashboard/ai-growth/page.tsx:33-38` tells the operator *"No AI calls are made
here — and that's deliberate … never invented numbers."*
`components/dashboard/ai-recommendation-card.tsx:52` labels its sample quote *"Example of what
you'll see — sample content, not your data."* `components/bookings/payment-link-action.tsx:7`
is designed so there is *"never a fake capture."* This is genuinely good practice and should be
preserved.

**The marketing site is not.** The gap between the two is the single largest risk in the
repository.

### 15.1 AI capability claims

AI Growth is a **real, working, well-documented rule engine** — trailing 3-month averages,
threshold rules, and a weighted scoring formula computed from Prisma rows
(`lib/analytics/business-brain.ts:51-255`). The *feature* is real. The word *"AI"* is not: a
repo-wide grep for `api.openai.com|openrouter.ai|anthropic|chat/completions` across `app/`,
`lib/`, and `components/` returns **nothing**. The `OPENAI_API_KEY` / `OPENROUTER_API_KEY`
variables (`.env.example:93-99`, headed *"placeholders only for now"*) feed only two boolean
readiness displays.

Claims with no implementation behind them:

| Claim | Location | Reality |
|---|---|---|
| **"AI Copilot** — Ask for next actions, operational summaries, and revenue ideas" | `app/ai-platform/page.tsx:29` | **No chat or copilot surface exists.** |
| **"AI Reports** — Summarize revenue, demand, risk … into executive-ready reports" | `app/ai-platform/page.tsx:32` | **No summarizer exists.** |
| "AI Search" | `app/ai-platform/page.tsx:30` | Prisma `contains` substring match (`app/api/workspaces/[id]/search/route.ts:19-40`) |
| "AI Scheduling" | `app/ai-platform/page.tsx:31` | Rule scoring (`lib/workforce/matching.ts`) |
| "AI Itinerary Builder" | `app/ai-platform/page.tsx:33` | `lib/itinerary/generator.ts:13` self-describes as *"not an LLM call"* |
| "The modern AI OS for tour operators" | `components/marketing/marketing-sections.tsx:84-88` | Whole-product framing |

Related: **`ai_credits_monthly` is sold at 100/500/2500/unlimited** (`lib/plans/catalog.ts:125,
168, 216, 268`), seeded into `Entitlement` rows, and **rendered to admins as a plan limit**
(`app/admin/plans/page.tsx:56-63`). It is never read, decremented, or enforced anywhere.
Customers are sold a metered quantity that does not exist.

### 15.2 Fabricated testimonials — regulatory exposure

`app/page.tsx:99-118` defines three quotes attributed to **"Maya · City experiences operator"**,
**"Daniel · Private travel agency founder"**, and **"Ari · DMC operations lead"**, rendered at
`:227-232` under the eyebrow **"Trust"**, with **no "illustrative" or "composite" disclaimer
anywhere in the section**.

The repository demonstrates it knows better: `app/solutions/[slug]/page.tsx:166-170` *does*
correctly disclaim its composite case study. One fabricated quote (`app/page.tsx:106`) asserts
*"The AI itinerary builder and CRM timeline changed how quickly we can respond"* — an invented
endorsement of a capability that is a rule engine.

This is a launch blocker under FTC endorsement guidance and equivalent EU/UK rules. **Fix by
deleting or clearly disclaiming — cost is minutes.**

### 15.3 A REST API, API keys, and outbound webhooks that do not exist

`content/developers/authentication.md:15,23-30` instructs users to go to **"Settings → API keys
→ Create key"** and call the API with `Authorization: Bearer <token>`.

- **There is no `ApiKey` model.** None of the 59 Prisma models is an API key or token.
- **There is no API-keys UI.** Grep for `api key` across `app/dashboard/` and `components/`
  returns zero.
- **There is no bearer-auth path.** Every API route uses `requireUserApi()`
  (`lib/auth/session.ts:35-39`), which reads the NextAuth session only.
- `public/openapi.json:16,443-446` publishes `"security": [{"bearerAuth": []}]` — a spec for an
  auth mode the server cannot accept.
- **Outbound webhooks do not exist.** The only webhook code is the *inbound* Stripe receiver.

Compounding: `lib/marketing/pricing.ts:112` ticks *"REST API and webhooks"* ✓ on **all four
plans**, including Solo and Operator whose `api_access` flag is `false`
(`lib/plans/catalog.ts:81`) — so the comparison table contradicts the entitlement catalog as
well as the code.

### 15.4 Other unbacked claims

| Claim | Location | Reality |
|---|---|---|
| **Contractual uptime SLA with service credits**, *"measured from our external monitoring, which polls core endpoints at one-minute intervals from multiple regions"* | `content/legal/service-level-agreement.md:19-22,28,65-67`; `lib/marketing/pricing.ts:115` | **No monitoring, no health endpoint (§10), and no `/status` route exist.** A money-back commitment resting on an unverifiable measurement clause. |
| **12 integrations badged "Integration-ready ✓"** | `app/integrations/page.tsx:41-52` | **Only Stripe and Cloudflare are implemented.** Maps, Calendar, Twilio, WhatsApp, OpenAI, OpenRouter, n8n, Zapier, outbound webhooks, and the REST API have no code. The hedge is buried in the intro while the cards show green checkmarks. |
| **Video library with exact runtimes** ("6:20", "11:20", …), *"Captions and transcripts are available on each"* | `app/demo/page.tsx:33-63`; `content/docs/videos.md:11-58` | `public/` contains **exactly two files** — `openapi.json` and one PNG. **Every click is a dead end.** |
| **SSO/SAML sold on Enterprise** | `lib/plans/catalog.ts:257,286` | No SAML/SSO/MFA implementation exists; auth is credentials-only. |
| **"35-day backup retention"** | `content/legal/security-policy.md:33` | One manual `pg_dump` line in a doc (§10). |
| **GDPR/CCPA data rights** | `content/legal/gdpr.md`, `ccpa.md` | No deletion or export path exists (§7). |

Well-handled by contrast, and worth preserving: the PCI claim is **accurate** (Stripe-hosted,
SAQ-A scope, `content/legal/security-policy.md:75`), and SOC 2 is **hedged rather than
claimed** (`:77`). No "bank-level"/"military-grade" language appears anywhere.

### 15.5 Silent data loss on marketing forms

`components/marketing/newsletter-signup.tsx:54` displays **"You are subscribed. Check your
inbox to confirm."** The endpoint (`app/api/marketing/subscribe/route.ts:28-43`) emails
`SITE.salesEmail` — **never the subscriber** — and when `SMTP_HOST` is unset it `console.info`s
and still returns `{subscribed: true}`. **There is no subscriber table.** The address is
discarded and the user is told to check an inbox for an email that was never sent.

The same silent-success pattern applies to `app/api/marketing/contact/route.ts:71-77`: a sales
enquiry submitted without SMTP configured returns `202 {received:true}` and is **lost to a log
line**. Given that SMTP is optional and unconfigured by default, **inbound leads will be
silently destroyed.**

### 15.6 Stale "Phase N" copy that understates shipped features

The reverse problem — the dashboard tells paying users the product is less finished than it is:

| Copy | Location | Reality |
|---|---|---|
| *"bookings, payments, and AI modules arrive in later phases"* — on **every dashboard page** | `components/app/app-shell.tsx:74` | All three are live. |
| *"Self-serve upgrades arrive with billing in Phase 10"* — rendered **directly above working checkout buttons** | `components/dashboard/upgrade-prompt.tsx:27` → `app/dashboard/billing/page.tsx:115,161` | Self-contradicting on the page where money changes hands. |
| *"Media uploads arrive with file storage in a later phase — paste a URL for now."* | `components/tours/tour-form.tsx:302` | S3 storage is implemented (`lib/storage/s3.ts`). |
| *"Paid billing arrives in Phase 10"* | `app/admin/page.tsx:56` | Checkout is live. |
| *"Direct payouts … are still being completed"* | `app/dashboard/billing/page.tsx:180-181` | Connect destination charges work. |

### 15.7 Onboarding can never reach 100%

`lib/onboarding.ts:56` and `:71` hardcode `done: false` on two of seven checklist items
(`stripe_payouts`, `enable_ai_growth`). They are literal constants, not computed. Because
`onboardingProgress` (`:77-83`) divides by `items.length` = 7, **the progress bar hard-caps at
5/7 = 71% for every customer, forever** — including on the main dashboard
(`app/dashboard/page.tsx:162-174`).

Worse, **both blocking steps are already shipped**:
- `enable_ai_growth` links to `/dashboard/ai-growth`, which exists and works. The user clicks,
  sees the live dashboard, returns, and the box is still empty and labelled "Phase 7".
- `stripe_payouts` says payouts are *"a future upgrade"* and links to `/dashboard/billing`,
  which has no payout controls. The working Connect onboarding is at `/dashboard/payments`.
  **The one step that would get an operator paid points at the wrong page and tells them the
  feature doesn't exist.**

The happy path itself is sound: create tour → set availability → publish → public booking page
→ Stripe Checkout → confirmation all genuinely work, and `publish_booking_page` is computed
correctly as *active + public + has a future scheduled departure*.

### 15.8 Admin metric defects

`app/admin/revenue/page.tsx:45-47` computes MRR/ARR from real subscription rows, but:

1. **Silently capped at 100 rows.** The source query is `take: 100` (`:30`). Past 100
   subscriptions, **MRR under-reports with no warning.** Blocking for any investor-facing use.
2. **Billing interval ignored.** A yearly subscriber contributes `plan.priceMonthly` (`:46`),
   but yearly is priced at ~10 months — annual customers are over-counted by roughly 20%.
3. **Currency hard-coded.** `formatMoney(mrr)` omits the currency argument and defaults to USD
   (`lib/utils.ts:18`), while the per-row table correctly passes `subscription.plan.currency`.

**Decorative chart, confirmed fake:** `app/admin/revenue/page.tsx:77` sets the "Plan Mix" bar
width to `count × 12%`, saturating at 9 subscriptions. It is not a proportion of anything; four
plans with 9+ subscribers each render four identical full bars.

**Other hard-coded values:** `app/admin/system-health/page.tsx:48,52` renders literal
`status="manual"` and `status="ready"` badges — *"Domain propagation checks: ready"* is a
string, not a probe, and can never turn red. `app/admin/white-labels/page.tsx:35` hard-codes
`value="5"`.

**Always-broken column:** `app/admin/licenses/page.tsx:55` reads
`limits.team_members ?? limits.members`, but neither key exists — the canonical key is `users`
(`lib/plans/catalog.ts:9`). Every row renders *"Not configured"*, so the seat-compliance screen
cannot show seat limits.

Similarly, the operator dashboard revenue tile (`app/dashboard/page.tsx:138`) sums
`Payment.amount` **with no currency filter** while formatting in the workspace currency —
mixed-currency payments would be silently added and mislabelled — and is **all-time, not
period-scoped**, with a label that says only "Revenue". All date windows use raw UTC
(`:58,67,76`) despite per-workspace timezones, as does the weekday bucketing in
`lib/analytics/business-brain.ts:42-49`, so "Saturday averages X%" is a **UTC** Saturday.

### 15.9 Super-admin console is read-only

Eleven of the twelve admin pages have **no write actions at all**. The single exception is
maintenance mode — which is wired to nothing (§8.3).

Missing: suspend/reactivate workspace (`app/api/admin/workspaces/route.ts` exports `GET` only;
no PATCH or POST exists anywhere under `app/api/admin/`), impersonation (grep returns zero
matches — no support path to reproduce a customer bug), resend verification/invitation
(invitations must be revoked and recreated), and any UI to trigger the three reconciliation
endpoints (an admin must `curl` with `CRON_SECRET`).

Present and good: config-readiness display that exposes only `Boolean(process.env.X)` without
revealing secrets (`app/admin/ai-providers/page.tsx:21-23`) — though coverage is AI-only, with
no Stripe/SMTP/S3/Cloudflare readiness view — and a minimal audit-log viewer (last 100, no
filter/search/export).

---

## 16. Requirements traceability

Status legend: ✅ done · ⚠️ partial · ❌ missing · 🔒 blocker

| # | Requirement | Current state | Evidence | Required change | Tests needed | Status |
|---|---|---|---|---|---|---|
| 1 | Green CI baseline | 6 integration tests fail; red since 2026-07-25 | §3 | Seed charge-ready `WorkspacePaymentAccount` in fixtures | existing suite green | 🔒 |
| 2 | Plans seeded on deploy | Entrypoint is `exec "$@"`; seed profile-gated | §4 | Idempotent seed in release step | fresh-deploy integration test | 🔒 |
| 3 | Subscription backfill | No backfill exists | §4 | Additive backfill migration/script | backfill idempotency test | 🔒 |
| 4 | Stripe price IDs configured | All six env vars blank; `providerPriceId` never seeded | §4 | Set env or seed provider IDs | checkout E2E in test mode | 🔒 |
| 5 | Scheduler for recurring jobs | None exists | §5 | Cron container or external scheduler + secret auth on 2 routes | job-invocation test | 🔒 |
| 6 | Capacity released on abandoned checkout | Sweep exists, never runs | §5, §6.1 | Wire scheduler; include `failed` payments | expiry sweep integration test | 🔒 |
| 7 | Paid-after-cancel recoverable | Webhook loops forever, rolls back idempotency row | §6.2 | Reconcile-and-refund path; never roll back `PaymentEvent` | regression test | 🔒 |
| 8 | Refund releases inventory | Refund touches neither booking nor availability | §6.3 | Add booking refund states + capacity release | refund lifecycle test | 🔒 |
| 9 | Password reset | Does not exist | §7 | Token model + routes + email + expiry/single-use | token lifecycle E2E | 🔒 |
| 10 | Email verification | `emailVerifiedAt` never written or read | §7 | Send/confirm/resend with throttle | verification E2E | 🔒 |
| 11 | Security headers | None; six missing | §8.1 | `headers()` with `/embed/**` carve-out | header assertion test | 🔒 |
| 12 | Rate limiting | None in app or committed WAF config | §8.2 | WAF rules committed, or in-app limiter | limiter unit test | 🔒 |
| 13 | Maintenance enforcement | Flag read by nothing at request time | §8.3 | Middleware enforcement | middleware test | 🔒 |
| 14 | Health/readiness endpoint | Does not exist | §10 | `/api/health` + container `HEALTHCHECK` | probe test | 🔒 |
| 15 | Suspended workspace lockout | `requireWorkspaceAccess` omits status filter | §9.1 note | Add status filter | tenancy test | 🔒 |
| 16 | Entitlement enforcement | 3 call sites; 22 feature flags unenforced | §12 | Wire `isFeatureEnabled` into gated APIs | per-flag authz tests | ⚠️ |
| 17 | Past-due loses access | `past_due` treated as entitled | §12 | Enforce `graceEndsAt` | dunning test | ⚠️ |
| 18 | White-label functional | Zero write paths; chrome hardcoded | §13.3 | Builder UI + apply to chrome/email, or withdraw claim | white-label E2E | ⚠️ |
| 19 | Custom domain SSL gate | Bypassed in manual provider mode | §13.1 | Enforce TLS gate for all providers | activation test | ⚠️ |
| 20 | Ownership transfer | `Workspace.ownerId` never updated | §7 | Transfer endpoint; sync `ownerId` | transfer test | ⚠️ |
| 21 | Account deletion / export | Missing while legal pages promise it | §7 | Implement, or amend legal copy | deletion test | ⚠️ |
| 22 | Observability | No logging, IDs, or error monitoring | §10 | Structured logs + correlation IDs + Sentry | — | ⚠️ |
| 23 | Rollback + smoke test runbooks | Missing | §10 | Author both; tag images | rehearsal | ⚠️ |
| 24 | Backup automation | One manual `pg_dump` vs "35-day retention" claim | §10 | Scheduled encrypted offsite backup + restore drill | restore rehearsal | ⚠️ |
| 25 | Solo plan at $29/mo | Verified 2900 cents | §11 | none | — | ✅ |
| 26 | Tenant isolation | 78/78 handlers guarded; no IDOR | §9.1 | none | broaden coverage | ✅ |
| 27 | Booking concurrency safety | Atomic + DB CHECKs + race test | §9.2 | none | — | ✅ |
| 28 | Payment confirmation truth | Webhook-only; redirect never trusted | §9.3 | none | — | ✅ |
| 29 | Cloudflare integration real | Genuine API + real DNS lookups | §9.5 | none | add domain tests | ✅ |
| 30 | Coupons / taxes / price variants | Entirely absent | §6.7 | Product decision required | — | ❌ |
| 31 | AI claims match implementation | Marketing sells LLM copilot/reports; code is a rule engine | §15.1 | Reword to "automated insights", or implement | — | 🔒 |
| 32 | Testimonials genuine or disclaimed | 3 fabricated named quotes, no disclaimer | §15.2 | Delete or disclaim (minutes) | — | 🔒 |
| 33 | REST API / API keys / webhooks | Documented in detail; no model, UI, or bearer path | §15.3 | Withdraw docs, or build | API auth tests | 🔒 |
| 34 | Marketing form submissions captured | Newsletter + contact silently discarded without SMTP | §15.5 | Persist submissions; fail loudly | delivery test | 🔒 |
| 35 | Uptime SLA backed by monitoring | Contractual credits; no monitoring, no `/status` | §15.4 | Add monitoring + status page, or amend SLA | — | 🔒 |
| 36 | Admin MRR/ARR accurate | Capped at 100 rows, interval-blind, USD-hardcoded | §15.8 | Aggregate in SQL; weight by interval; carry currency | MRR unit test | 🔒 |
| 37 | Onboarding completable | 2 items hardcoded `done:false`; caps at 71% | §15.7 | Compute both; fix payout link target | onboarding test | ⚠️ |
| 38 | Dashboard copy matches shipped state | "Phase N" copy understates live features | §15.6 | Remove stale copy | — | ⚠️ |
| 39 | No decorative fake metrics | Plan-mix bar, health badges, `value="5"` | §15.8 | Compute or remove | — | ⚠️ |
| 40 | Admin licenses seat limit | Reads non-existent key; always "Not configured" | §15.8 | Use `users` key | — | ⚠️ |
| 41 | Integrations page accurate | 12 badged ready, 2 implemented | §15.4 | Mark roadmap vs available | — | ⚠️ |
| 42 | Video library exists | Advertised with runtimes; `public/` has 2 files | §15.4 | Produce or remove | — | ⚠️ |
| 43 | SSO/SAML on Enterprise | Sold; not implemented | §15.4 | Implement or withdraw | — | ⚠️ |
| 44 | Super-admin write operations | 11 of 12 pages read-only; no suspend/impersonate | §15.9 | Build suspend + audited impersonation | admin authz tests | ⚠️ |

---

## 17. Mandatory launch gates — current status

| Gate | Status |
|---|---|
| Clean dependency install | ✅ PASS |
| Schema validation passes | ✅ PASS |
| Migrations pass against a fresh database | ✅ PASS (19 migrations, 60 tables) |
| Lint passes | ✅ PASS |
| Type-check passes | ✅ PASS |
| **All tests pass** | ❌ **FAIL — 6 integration failures** |
| Production build passes | ✅ PASS |
| **No unresolved critical/high security finding** | ❌ **FAIL — §8** |
| **Stripe test-mode E2E passes** | ❌ **FAIL — blocked by the same 409 gate** |
| Stripe production configuration verified | ⬜ UNVERIFIED — no production access |
| Webhook delivery succeeds in production | ⬜ UNVERIFIED |
| Transactional production email smoke test | ⬜ UNVERIFIED |
| Custom-domain test on a controlled domain | ⬜ UNVERIFIED |
| **Backup created and restore tested** | ❌ **FAIL — no automation, no rehearsal** |
| **Health/readiness checks pass** | ❌ **FAIL — endpoint does not exist** |
| Critical pages return expected status codes | ⬜ UNVERIFIED |
| **No visible fake/placeholder functionality** | ❌ **FAIL — §15 (extensive), §13.3, §12** |
| **Rollback procedure documented and feasible** | ❌ **FAIL — does not exist** |

**9 of 18 gates fail; 5 cannot be verified without production access. The term "production
ready" must not be used for this build.**

---

## 18. Recommended implementation phases

Ordered by the commercial priority in the master prompt: revenue first, then integrity, then
reliability, then features.

### Phase A — restore a trustworthy baseline (must be first)
1. Fix the 6 failing integration tests (test-side fixture change). **Nothing else can be
   verified until CI is green.**
2. Add a CI branch-protection requirement so `main` cannot go red again.
3. Make `npm audit` blocking at an agreed severity.

### Phase A2 — truthfulness sweep (do immediately; hours, not days)
These carry legal and reputational risk far out of proportion to their cost. Most are copy
edits and can ship alongside Phase A.

4. Delete or disclaim the three fabricated homepage testimonials (§15.2).
5. Reword AI capability claims to what the rule engine actually does, and remove "AI Copilot"
   and "AI Reports" until they exist (§15.1).
6. Withdraw the REST API / API-keys / webhooks documentation and the `bearerAuth` OpenAPI
   declaration, or gate them behind a clearly-marked roadmap page (§15.3).
7. Re-badge the integrations page to distinguish available from planned (§15.4).
8. Remove the video library listings until videos exist (§15.4).
9. Amend or remove the uptime SLA credit table until monitoring and a status page exist (§15.4).
10. Remove SSO/SAML from the Enterprise feature list, or mark it as roadmap (§15.4).
11. Strip stale "Phase N" copy from the dashboard, admin, and tour form (§15.6).
12. Persist marketing form submissions and stop reporting success on silent failure (§15.5) —
    this one is a small code change, not copy, and is losing real leads today.

### Phase B — revenue path
13. Idempotent plan seeding in the release step; ship `tsx`/`prisma` in the runner image or move
    seeding into the `migrate` service.
14. Subscription backfill for existing workspaces.
15. Configure and verify the six `STRIPE_PRICE_*` variables; add a startup check that fails
    loudly when a required price is missing.
16. Empty-state handling on the billing page so it can never render blank.
17. Enforce `past_due`/`graceEndsAt`; add the dunning email.
18. Fix admin MRR/ARR — aggregate in SQL rather than over a 100-row page, weight by billing
    interval, and carry plan currency (§15.8).

### Phase C — booking and payment integrity
19. Fix paid-after-cancel (§6.2) — never roll back the idempotency row.
20. Include `failed` payments in the expiry sweep (§6.1).
21. Add booking `refunded`/`partially_refunded` states and release capacity on refund (§6.3).
22. Settle superseded payment rows; handle `checkout.session.expired` (§6.4).
23. Fix the zero-decimal platform-fee scale bug (§6.5) and add a currency-consistency guard (§6.6).
24. Add money CHECK constraints.

### Phase D — scheduler and reliability
25. Introduce a scheduler (cron container is sufficient for the current architecture).
26. Add cron-secret auth to `expire-pending` and `messages/sweep`.
27. `/api/health` with a DB probe, plus container `HEALTHCHECK`.
28. Startup env validation that fails fast.
29. Structured logging, correlation IDs, error monitoring.
30. Backup automation, restore rehearsal, rollback runbook, post-deploy smoke script.

### Phase E — auth and account lifecycle
31. Password reset (hashed, single-use, expiring) and email verification with throttling.
32. Rate limiting on login, register, reset, public booking, and contact.
33. Close the enumeration oracle; hash invitation tokens; add session `maxAge`.
34. Add the workspace status filter to `requireWorkspaceAccess`.
35. Ownership transfer; account deletion/export (or amend the legal claims).

### Phase F — security hardening
36. Security headers with an explicit `/embed/**` carve-out (do not skip this — it will break
    every customer embed).
37. Origin validation on high-risk mutations; assert cookie `sameSite` explicitly.
38. Commit the WAF/CDN rate-limit configuration, or emit the `X-RateLimit-*` headers the public
    docs already promise.
39. Maintenance-mode middleware enforcement (§8.3) — until this lands, the admin toggle is a
    switch wired to nothing.

### Phase G — entitlements
40. Wire `isFeatureEnabled` into every gated API surface.
41. Implement AI credit metering against `UsageMeter`, or remove the credit claim.
42. Enforce the `workspaces` limit.
43. Fix the admin licenses seat-limit key (§15.8).
44. Either build the white-label write path and apply branding to chrome and email, or remove
    the white-label claims from the Solo plan, the admin console, and the marketing site.
45. Enforce the TLS gate for all domain providers.

### Phase H — onboarding, storefront, super-admin, and polish
46. Compute the two hardcoded onboarding steps and repoint the payout link at
    `/dashboard/payments` (§15.7).
47. Replace decorative metrics — plan-mix bar, hard-coded health badges (§15.8).
48. Storefront pages beyond `/` and `/tours/<slug>`; apply favicon and typography.
49. Tenant `sitemap.xml`/`robots.txt`.
50. Super-admin write operations: suspend/reactivate, audited impersonation, job triggers.
51. Scope dashboard revenue by period and workspace timezone; fix UTC weekday bucketing (§15.8).
52. Accessibility, responsive, and Lighthouse gates.

---

## 19. Open product decisions required

These cannot be resolved from the code and need an explicit business answer before the
corresponding work can start:

1. **Coupons, taxes, and price variants are entirely absent.** Are they in scope for launch, or
   is the launch scope single-price-per-tour?
2. **Is the marketplace/vendor-payout story in scope?** Connect onboarding, destination charges,
   and application fees work, but there is no payout ledger and no `payout.*`/`transfer.*`
   webhook handling. The master prompt's guidance is to launch operator-only rather than ship a
   misleading partial marketplace.
3. **White-label**: build it, or withdraw the claim from the Solo plan and the marketing site?
4. **GDPR/CCPA deletion and export** are advertised on the public legal pages but not
   implemented. Build, or amend the copy with counsel?
5. **"35-day backup retention"** is advertised at `content/legal/security-policy.md:33` with no
   backup automation behind it. Build, or amend?
6. **Merchant of record** is not documented anywhere. This has tax and liability implications
   and must be decided before payouts scale.
7. **AI positioning.** The product is a well-built deterministic rule engine marketed as an "AI
   Travel Operating System". Three options: (a) reword the marketing to describe automated
   insights honestly, (b) actually integrate an LLM provider — noting there is currently **no
   redaction or prompt-injection layer to build on**, so that work is larger than adding a key,
   or (c) keep the rule engine and market it as "AI-assisted" with a clear methodology page.
   This decision gates a large amount of copy and several roadmap claims.
8. **REST API and outbound webhooks** are documented in detail and sold on the pricing
   comparison table. Build them, or withdraw the documentation? This affects the `api_access`
   entitlement and the published OpenAPI spec.

---

## 20. Audit environment

- Node 22 · PostgreSQL 16 (disposable instance created for this audit)
- Dependencies installed via `npm ci` from the committed lockfile
- Migrations and seed run against a fresh `tripistic_test` database
- CI history read from the GitHub Actions API for `Shubochandrosarker/tripistic`
- No production system was accessed; no application file was modified
