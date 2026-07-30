# Tripistic Premium Public Launch — Implementation Plan

**Plan date:** 2026-07-30
**Base commit:** `9aad017` (`main`)
**Prompt's audited commit:** `edb0552` — now two merges behind; §1 records the delta.
**Working branch:** `claude/public-launch-phase-1`

This document satisfies the master prompt's pre-code requirement: a verified delta
against `docs/FINAL-LAUNCH-AUDIT.md`, the findings already resolved on `main`, a
dependency-aware checklist, the first focused phase, and its migration, rollback,
and test strategy.

---

## 0. Baseline — measured on `9aad017`, not assumed

Every command from the mandatory protocol, run against a disposable PostgreSQL 16
instance:

| Check | Result |
|---|---|
| `git status --short` | clean |
| `npm ci` | pass |
| `npx prisma format --check` | pass — "All files are formatted correctly" |
| `npx prisma validate` | pass |
| `npm run db:migrate` | pass — no pending migrations (19 applied) |
| `npm run db:seed` | pass — 4 plans, idempotent |
| `npm run lint` | pass — 0 errors, 0 warnings |
| `npm run typecheck` | pass — 0 errors |
| `npm run test:unit` | pass — **74/74**, 9 files |
| `npm run test:integration` | pass — **161/161**, 24 files |
| `npm run test:e2e` | pass — **6/6** |
| `npm audit --omit=dev` | pass — 0 vulnerabilities |
| `docker compose … config` | pass |

**The baseline is fully green.** This is the first point in the project's history
where that is true of all three suites simultaneously.

---

## 1. Verified delta against `docs/FINAL-LAUNCH-AUDIT.md`

The audit was written at `e3a30d3`. `main` has advanced by three merges since.

### 1.1 Resolved on current `main` — do not repeat

| Audit finding | Status | Evidence |
|---|---|---|
| **P0-1 — CI red on `main` since 2026-07-25** | ✅ Resolved | PR #10 (`1fb087b`). Integration 155→161 passing. Root cause was fixtures missing `WorkspacePaymentAccount` / `Subscription` rows after `global-setup` truncates `plans`. |
| **§15.10 — `e2e` job silently skipped since 2026-07-16** | ✅ Resolved | `needs: test` now satisfied; e2e executes and passes. |
| **§15.10 — consent banner blocked the Playwright signature pad** | ✅ Resolved *in tests only* | PR #10 added `tests/e2e/consent.ts`. **The underlying UX defect is untouched** and is Phase 9 work — see §1.2. |
| **§15.10 — storefront heading selector ambiguity** | ✅ Resolved | Pinned to `level: 1`. |
| **Flaky waiver publish assertion** | ✅ Resolved | PR #11 (`4a601a7`). Assertion no longer races a non-awaited `router.refresh()`. |

The prompt's instruction "Confirm `main` includes PR #10's CI fixture fix. Do not
repeat it." is satisfied — verified by `git show origin/main:tests/integration/helpers.ts`
containing `createTestPaymentAccount`.

### 1.2 Still outstanding — every other audit finding

No production behaviour has changed since the audit. All seven P0 blockers other
than P0-1 stand, re-verified against `9aad017` today:

| # | Finding | Audit § | Prompt phase |
|---|---|---|---|
| Empty billing page — deploys never seed plans | §4 | 2 |
| No subscription backfill | §4 | 2 |
| `STRIPE_PRICE_*` unset; `providerPriceId` never seeded | §4 | 2 |
| No scheduler — 7 job classes never run | §5 | 4 |
| Declined payments hold seats forever | §6.1 | 3 |
| Paid-after-cancel loops Stripe retries, rolls back idempotency row | §6.2 | 3 |
| Refunds release neither seat nor booking | §6.3 | 3 |
| Stale payment rows can cancel a live checkout | §6.4 | 3 |
| Zero-decimal platform fee stored at 100× | §6.5 | 3 |
| No currency-consistency guard | §6.6 | 3 |
| Confirmation page renders in server timezone | §6.8 | 3 |
| No password reset / email verification | §7 | 5 |
| No security headers | §8.1 | 5 |
| No rate limiting | §8.2 | 5 |
| Maintenance mode not enforced | §8.3 | 5 |
| Suspended workspaces retain full API access | §9.1 | 5 |
| 22 feature flags unenforced; `isFeatureEnabled` has zero callers | §12 | 6 |
| `past_due` keeps full access | §12 | 2/6 |
| White-label has zero write paths | §13.3 | 7 |
| Manual-provider SSL gate bypass | §13.1 | 7 |
| Host-cache never invalidated; `x-forwarded-host` trusted | §13.2 | 5/7 |
| Storefront: only `/` and `/tours/[slug]` resolve | §13.4 | 7 |
| No `/api/health`, no app container `HEALTHCHECK` | §10 | 4/10 |
| No structured logging, correlation IDs, error monitoring | §10 | 4 |
| No rollback runbook, smoke test, backup automation | §10 | 10 |
| Marketing sells what the product does not do | §15.1–15.4 | **1** |
| Marketing form submissions silently discarded | §15.5 | **1** |
| Stale "Phase N" copy | §15.6 | **1** |
| Onboarding capped at 71% | §15.7 | 9 |
| Admin MRR truncated at 100 rows, interval-blind, USD-hardcoded | §15.8 | 2 |
| Super-admin console read-only | §15.9 | 9 |
| `npm audit` gate is decorative | §10 | 10 |

### 1.3 Corrections to the prompt's own premises

Two claims in the master prompt do not match the code, and following them literally
would produce wrong work:

1. **"Solo remains exactly `$29/month` and `$278/year`"** — correct, and already
   true. `lib/plans/catalog.ts:84-89` defines `2900` / `27800` cents, verified
   against a live seeded database. No change needed; guard it with a test instead.
2. **Phase 1 says "Remove SSO/SAML claims until implemented."** SSO/SAML appears in
   the *plan catalog* (`lib/plans/catalog.ts:257,286`), which is also the source of
   truth for seeded entitlements. Removing the string without removing the
   `sso_saml` flag would leave a seeded entitlement with no public name; removing
   the flag changes seeded data. Handled as a catalog change plus a seed
   compatibility note, not a copy edit.

---

## 2. Dependency-aware issue checklist

Ordering constraints that matter, independent of the prompt's numbering:

```
Phase 1 (claims + lead capture)         ── no dependencies. Start here.
   │
Phase 2 (seeding, backfill, Stripe)     ── blocks 6: entitlements need subscriptions
   │                                        that actually exist.
   ├── Phase 3 (payment correctness)    ── independent of 2; both touch billing/payment
   │                                        services, so sequence to avoid conflicts.
   │
Phase 4 (scheduler)                     ── REQUIRED BY 3. The expiry sweep is the
   │                                        mechanism 3's capacity fixes rely on;
   │                                        fixing sweep logic without a runner ships
   │                                        dead code.
   │
Phase 5 (auth, security, rate limits)   ── partially blocks 1: Phase 1 requires rate
   │                                        limiting on contact/newsletter. Phase 1
   │                                        ships a local limiter; Phase 5 replaces it
   │                                        with the shared one.
   │
Phase 6 (entitlements)                  ── needs 2.
Phase 7 (white-label/domains)           ── needs 6 (white_label flag) + 4 (domain poll).
Phase 8 (AI)                            ── needs 6 (credit limits) + 4 (metering reset).
Phase 9 (UI/onboarding/super-admin)     ── needs 2,4,7 for real status values.
Phase 10 (production launch)            ── needs everything.
```

**Two orderings in the prompt are worth flagging:**

- **Phase 3 before Phase 4 is inverted.** Phase 3's acceptance criterion "declined
  payments release inventory" cannot be satisfied without a scheduler to run the
  sweep. Recommendation: implement Phase 3's *logic* with tests that invoke the
  sweep directly (as today), then Phase 4 wires the runner. Flagged so the Phase 3
  completion report does not overstate what is live.
- **Phase 1 requires rate limiting**, which is Phase 5. Resolved by scoping a
  narrow, self-contained limiter for the two public marketing endpoints in Phase 1,
  explicitly marked for replacement in Phase 5 rather than duplicated.

---

## 3. Phase 1 — the first focused implementation phase

**Goal:** every public claim matches the code, and no lead is ever silently lost.

Chosen first because it carries legal and commercial risk out of all proportion to
its cost — most of it is copy, and the one code change is small.

### 3.1 Work items

**A. Marketing corrections** (copy and catalog only, no schema)

| Item | Target | Action |
|---|---|---|
| A1 | `app/page.tsx:99-118`, rendered `:227-232` | Remove the three fabricated named testimonials. The section is under an eyebrow reading "Trust"; there is no honest way to keep invented endorsements there. |
| A2 | `app/ai-platform/page.tsx:29-33` | Remove "AI Copilot" and "AI Reports" (no implementation). Reposition "AI Search"/"AI Scheduling"/"AI Itinerary Builder" as automated/rule-based. |
| A3 | `components/marketing/marketing-sections.tsx:84-88`, `lib/marketing/content.ts` | Retire "AI Travel Operating System" / "AI OS" framing in favour of "Automated Business Insights" / "Business Brain". |
| A4 | `app/integrations/page.tsx:41-52`, `lib/marketing/content.ts:281-294` | Add explicit Available / Beta / Planned status. Only **Stripe** and **Cloudflare** are Available — the only two with implementation evidence. |
| A5 | `app/demo/page.tsx:33-63`, `content/docs/videos.md` | Remove the video library; `public/` contains two files and no video. |
| A6 | `lib/plans/catalog.ts:257,286` | Remove the SSO/SAML feature string and `sso_saml` flag (see §1.3.2). |
| A7 | `content/legal/service-level-agreement.md:19-28,65-67`, `lib/marketing/pricing.ts:115` | Remove the contractual uptime/service-credit promise and the "external monitoring polls every minute" clause; no monitoring or status page exists. |
| A8 | `content/developers/*.md`, `public/openapi.json:16,443-446` | Remove REST API / API-key / bearer-auth / outbound-webhook promises. No `ApiKey` model, no bearer path, no outbound webhooks. |
| A9 | `lib/marketing/pricing.ts:112` | Align comparison rows with canonical entitlements — the "REST API and webhooks" row currently ticks all four plans while `api_access` is `false` on two. |
| A10 | `components/app/app-shell.tsx:74`, `components/dashboard/upgrade-prompt.tsx:27`, `app/admin/page.tsx:56`, `app/admin/plans/page.tsx:22`, `components/tours/tour-form.tsx:302`, `app/dashboard/billing/page.tsx:180-181` | Remove stale "Phase N" copy that *understates* shipped features. |

**B. Marketing form protection** (schema + service + admin)

New models, additive:

- `MarketingContactSubmission` — name, email, company, topic, message, consent
  timestamp, source, hashed IP/UA, delivery state, failure reason, timestamps.
- `NewsletterSubscriber` — unique normalized email, source, consent timestamp,
  hashed IP/UA, double-opt-in state, delivery state, timestamps.

Behaviour:

- Persist **first**, then attempt delivery. Persistence must not depend on SMTP.
- Response copy must be honest: never claim a confirmation email was sent when it
  was not (today `newsletter-signup.tsx:54` says "Check your inbox" while the
  address is discarded entirely).
- Duplicate subscribe is idempotent, not an error, and must not leak whether an
  address is already registered.
- Honeypot retained; add a narrow rate limiter (see §2).
- Admin list/search/export.

### 3.2 Explicitly out of scope for Phase 1

Named so the completion report cannot overstate:

- Double-opt-in *email sending* — the retryable outbox is Phase 4. Phase 1 stores
  the state field and leaves confirmation unsent.
- The shared distributed rate limiter — Phase 5.
- The consent-banner UX defect — Phase 9.
- Any change to the AI feature itself — Phase 8. Phase 1 only corrects claims.

---

## 4. Migration, rollback, and test strategy for Phase 1

### 4.1 Migration

One additive migration, `marketing_lead_capture`:

- `CREATE TABLE marketing_contact_submissions`
- `CREATE TABLE newsletter_subscribers`
- unique index on `newsletter_subscribers(email_normalized)`
- indexes on `created_at` for admin listing
- CHECK: delivery state ∈ enum

**No existing table is altered. No column is dropped. No data is migrated.** The
app runs unchanged if the migration is applied and the code is not deployed, and
vice versa — so deploy order does not matter.

### 4.2 Rollback

- **Code:** revert the release image. The new tables become inert; nothing else
  reads them.
- **Database:** no destructive rollback. Per the prompt's rule, forward-fix only.
  Dropping the tables would destroy captured leads and is never the right move.
- **Copy changes:** pure content revert, no state.

The A6 catalog change is the only item with data implications: removing `sso_saml`
leaves existing seeded `Entitlement`/`FeatureFlag` rows for that key orphaned but
harmless — the seed's deactivation sweep handles removed keys, and nothing reads
the flag (`isFeatureEnabled` has zero callers today, per audit §12). Verified
before merge with an integration test asserting a re-seed over an existing
database is clean.

### 4.3 Tests

**Unit**
- email normalization and validation
- honeypot detection
- rate-limit bucket boundaries
- catalog invariants: Solo is exactly `2900` / `27800`; no plan advertises a
  feature whose flag is absent (guards A6/A9 against future drift)

**Integration**
- contact submission persists with SMTP unavailable
- newsletter subscribe persists with SMTP unavailable
- duplicate subscribe is idempotent and does not leak existence
- delivery failure is recorded with a reason, not swallowed
- admin list/search is tenant-agnostic but platform-admin-guarded
- rate limiter returns 429 after threshold

**Content assertion tests** — the durable half of Phase 1. Copy fixes rot; a test
that fails when a fabricated claim reappears does not:
- no marketing surface contains the removed testimonial names
- no marketing surface claims "AI Copilot", "AI Reports", or LLM capability
- `public/openapi.json` declares no `bearerAuth` while no bearer path exists
- every integration marked Available maps to a module that exists

### 4.4 Verification gate for the phase

`npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:integration`,
`npm run build`, plus the new tests. E2E re-run because marketing routes are in the
build graph.

---

## 5. Reporting rule

Per the prompt's protocol item 10: this plan does **not** claim any external
production configuration is verified. Stripe live keys, SMTP credentials,
Cloudflare tokens, backups, and monitoring remain unverified from this environment
and will be reported as such in every completion report.
