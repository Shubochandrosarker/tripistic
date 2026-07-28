# Tripistic Public Launch Baseline

Date: 2026-07-27
Workspace: `D:\Download\tripistic-main (4)\tripistic-main`
Source prompt: `D:\Download\TRIPISTIC_PUBLIC_LAUNCH_MASTER_PROMPT.md`

## 1. Repository Status

This workspace is an extracted project folder, not a Git checkout.

| Check | Result |
| --- | --- |
| `git status --short` | Failed: `fatal: not a git repository (or any of the parent directories): .git` |
| Version | `package.json` is `2.0.0` |
| Stack | Next.js 15.5.21, React 19.2.7, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL, Auth.js v5 beta, Stripe 22.3.1, Tailwind v4, Vitest, Playwright |
| CI | `.github/workflows/ci.yml` exists and runs Postgres-backed CI on Ubuntu |

Release commits cannot be made from this folder until it is restored as a Git repository or replaced with a real checkout.

## 2. Validation Results

Commands were run from `D:\Download\tripistic-main (4)\tripistic-main`.

| Command | Result |
| --- | --- |
| `cmd /c npm ci` | Passed. Prisma Client generated. Reported 9 high-severity dev dependency vulnerabilities. |
| `cmd /c npx prisma validate` | Failed because `DATABASE_URL` is not set. |
| `cmd /c "set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripistic_test&& npx prisma validate"` | Passed. Schema is valid when `DATABASE_URL` exists. |
| `cmd /c npm run lint` | Passed, no output after ESLint banner. |
| `cmd /c npm run typecheck` | Passed. |
| `cmd /c npm run test:unit` | Passed: 9 files, 74 tests. |
| `cmd /c npm run test:integration` | Initially failed because the old Bash runner could not run on Windows. Phase 0 replaced it with a Node runner. Current result: fails before tests because `DATABASE_URL` is not set. |
| `cmd /c npm run test:e2e` | Phase 0 Node runner starts correctly. Current result: fails before browser setup because `DATABASE_URL` is not set. |
| `cmd /c npm run build` | Exited 0. Build logged Edge Runtime warnings from Auth.js/Jose and Prisma `DATABASE_URL` errors while collecting static page data for Prisma-backed dynamic pages. |
| `cmd /c npm audit --omit=dev` | Passed: 0 production vulnerabilities. |
| `cmd /c npm audit --audit-level=critical` | Passed threshold but reported 9 high-severity dev dependency vulnerabilities through ESLint/minimatch/brace-expansion. |

## 3. Current Architecture

Tripistic is a shared-database, workspace-scoped SaaS. `Workspace` is the tenant boundary, `WorkspaceMember` grants roles, and API/page code generally resolves access through `requireWorkspaceAccess`, `getActiveWorkspace`, and explicit capability functions in `lib/auth/permissions.ts`.

```mermaid
flowchart LR
  Guest[Traveler] --> PublicRoutes[/book, /embed, /api/public/]
  Operator[Workspace user] --> Dashboard[/dashboard]
  Admin[Platform admin] --> AdminApp[/admin and /api/admin]
  PublicRoutes --> PublicTenancy[lib/tenancy/public.ts]
  Dashboard --> WorkspaceGuard[lib/tenancy/workspace.ts]
  AdminApp --> AdminGuard[DB-verified platform admin guard]
  PublicTenancy --> Services[Domain services]
  WorkspaceGuard --> Services
  Services --> Prisma[(PostgreSQL via Prisma)]
  Services --> Stripe[Stripe platform Checkout today]
  Services --> SMTP[SMTP email if configured]
```

Core route surfaces:

- Marketing/content: `/`, `/pricing`, `/features/*`, `/solutions/*`, `/docs/*`, `/help/*`, `/blog/*`, legal pages.
- Auth/account: `/login`, `/register`, `/invite/*`, `/workspaces/new`.
- Operator dashboard: `/dashboard/*`.
- Platform admin: `/admin/*`.
- Public traveler routes: `/book/*`, `/embed/*`, `/itinerary/*`, `/api/public/*`.
- Payment webhook: `/api/stripe/webhook`.

## 4. Implemented Features

- Registration and workspace creation with owner membership and a local trial subscription when seeded plans exist.
- Workspace-based multi-tenancy with explicit role permissions and last-owner protection.
- Tour/package CRUD, schedules, blackout dates, availability generation, add-ons, and public/private visibility.
- Public booking flow with server-side price calculation, high-entropy public tokens, idempotency keys, honeypot field, body-size cap, and atomic PostgreSQL capacity reservation.
- Stripe Checkout for traveler booking payments through the platform Stripe account.
- Signed Stripe webhook processing for platform payment events, idempotent `PaymentEvent` persistence, and transactionally confirmed bookings.
- Pending payment expiration service and admin-triggered sweep endpoint.
- Customer CRM, companies, leads, tasks, activities, messaging records, SMTP-backed email delivery when configured, unsubscribe token logic, and reminder service.
- Guide/workforce, waivers/signatures, operations board, vehicles, suppliers, supplier invoices, incidents, itinerary builder, and rule-based business brain.
- Super-admin read surfaces for organizations, users, plans, revenue, licenses, domains, white labels, AI providers, system health, audit logs, and maintenance.
- Marketing website, SEO metadata, sitemap, robots, OpenAPI document, content layer, legal template pages, and consent-gated analytics.
- CI workflow with Postgres service, Prisma validation/migration/seed, lint, typecheck, unit, integration, build, and Playwright e2e.
- Cross-platform Node runners for integration and e2e commands; the original Bash scripts remain for reference but npm now uses Node wrappers.

## 5. Partial or Scaffold-Only Features

- SaaS subscription billing is local-record/display-only. There is no Stripe Billing checkout, customer portal, proration, coupon, invoice, failed-payment, downgrade, or entitlement reconciliation flow.
- Plan catalog is not aligned with the public launch prompt. Seed Solo is `$19/month`; marketing Solo is `$49/month`; prompt requires `$29/month` and `$278/year`.
- Entitlements are feature flags plus plan JSON limits. There is no canonical `PlanPrice`, `Entitlement`, `UsageMeter`, or complete server-side enforcement for seats, domains, tours, AI usage, storage, booking limits, API access, automation, or white-label depth.
- Traveler payment flow uses the Tripistic platform Stripe account. There is no `WorkspacePaymentAccount`, Stripe Connect Express onboarding, connected-account checkout, payouts, refunds, disputes, reconciliation, or connected-account webhook handling.
- `Vendor` is correctly a supplier model, but UI labels still use "Vendors" in parts of the dashboard and marketing.
- White-label and custom-domain database models exist, but only admin read views/API are present. There is no operator builder, publish workflow, managed uploads, domain submission, DNS/TXT verification, provider provisioning, TLS checks, or hostname routing.
- AI provider config rows exist and deterministic analytics exist, but there is no provider-backed AI abstraction, encrypted provider secrets, usage metering, JSON output validation, fallback/circuit breaker, or AI action audit trail.
- Background work is implemented as callable service functions plus admin-only sweep endpoints, not a reliable queue/outbox with locking, retry backoff, dead-letter status, and worker process.
- Password reset, verified-email enforcement, MFA, recovery codes, suspicious-login notices, account export/deletion, recent-auth challenges, and strong CSRF/origin protection are not implemented.
- CSP/security headers and production WAF/rate limits are documented but not enforced by the app.
- Storefront remains booking-route centered; it is not a complete guided travel website builder with pages, gallery, SEO controls, revisions, preview/publish, custom routes, or tenant host routing.

## 6. Missing Launch-Critical Features

1. Canonical plan catalog and billing truth aligned to Solo `$29/month` and `$278/year`.
2. Stripe Billing for Tripistic subscriptions with signed, idempotent lifecycle webhooks and entitlement derivation from verified subscription state.
3. Stripe Connect Express merchant accounts for workspaces, including onboarding, status, connected checkout, payouts, refunds, disputes, and reconciliation.
4. Workspace payment account model storing safe Stripe IDs and capability/status metadata only.
5. Database-backed job/outbox system and separate worker process.
6. Guided storefront builder, managed media storage, draft/publish revisions, and tenant-aware SEO.
7. Custom-domain lifecycle: validation, DNS ownership, provider custom hostname provisioning, TLS health, routing, and takeover prevention.
8. Hostname-aware middleware/resolver that distinguishes marketing/app/admin/reserved hosts from active tenant storefront hosts.
9. Provider-backed AI system with metering, budget limits, redaction, structured JSON validation, and human confirmation gates.
10. Auth hardening: email verification, password reset, MFA, account export/deletion, invitation expiry/revocation controls, recent-auth challenge.
11. Security headers, CSP, origin/CSRF checks for high-risk mutations, distributed rate limiting, structured request/job logs, and monitoring hooks.
12. Production Docker/worker/deployment docs, backup/restore docs, incident runbook, environment validation, and release checklist updates.
13. Accessibility, responsive, Lighthouse CI, and e2e coverage for the Solo launch journey.

## 7. Security Risks

- Build and Prisma commands fail without `DATABASE_URL`; local production verification is incomplete until a test database is available.
- Public booking endpoint has no distributed rate limiter. Honeypot and body-size cap are useful but insufficient for launch.
- No app-level CSP/security headers policy was found.
- State-changing JSON APIs rely mostly on session cookies and server-side guards; high-risk endpoints need explicit origin/CSRF controls.
- Maintenance mode exists in the database/admin UI but is not enforced in middleware.
- Custom domains have no runtime host validation, no DNS/TLS verification, and no takeover-prevention flow beyond unique hostname rows.
- SaaS billing and entitlement state can drift because browser/dashboard state is local subscription data, not Stripe-verified billing state.
- Stripe Connect is absent, so the current public claim that traveler funds flow through the operator's own Stripe account is not true in code.
- AI provider configs store metadata only today; future provider secret handling needs encryption, redaction, and server-only boundaries before enabling AI.
- Password recovery, email verification enforcement, MFA, and recent-auth challenges are absent.
- Full audit found high-severity dev dependency advisories through ESLint/minimatch/brace-expansion. Production dependency audit is clean.

## 8. Architecture Decisions For Public Launch

- `Workspace` remains the tenant and merchant boundary.
- Keep the DB model name `Vendor` for compatibility, but relabel user-facing copy to `Suppliers` wherever it refers to hotels, restaurants, transport, activity providers, and invoices.
- Do not store Stripe secret keys for operators. Use Stripe Connect Express and persist only account IDs, status/capability fields, timestamps, and reconciliation metadata.
- Separate Tripistic SaaS billing from traveler booking payments in code, routes, webhook dispatch, models, docs, and tests.
- Use integer minor-unit storage for all money values. Add immutable fee/tax/discount/platform-fee snapshots before connected payments.
- Make database plan catalog the source of truth. Marketing pricing, dashboard billing, seed data, API output, and entitlement checks must all read from or be generated from it.
- Use a database-backed job/outbox first. It fits the current PostgreSQL architecture and avoids introducing Redis before the operational host is chosen.
- Custom-domain implementation should be adapter-based. Default provider target: Cloudflare for SaaS Custom Hostnames, gated by environment configuration and documented as an external setup requirement.
- Storefront host resolution should only route active domains and reserved platform hosts must be explicit: `tripistic.com`, `www`, `app`, `api`, `admin`, `status`, and other operational subdomains.
- AI must remain deterministic for metrics. LLMs can explain, draft, and suggest only, with structured output validation and explicit confirmation before risky actions.

## 9. Phased Implementation Plan

### Phase 0 - Baseline and Decisions

- Create this baseline document.
- Add Stripe Connect ADR.
- Add production provider/env validation design.
- Resolve current validation blockers before expansion: provide a test PostgreSQL URL, make integration/e2e scripts Windows-compatible or require Git Bash/WSL, and clean dev dependency audit where feasible.

### Phase 1 - Plans, Entitlements, and Stripe Billing

- Add canonical plan catalog semantics: `PlanPrice`, entitlements, usage meters, billing intervals, trial days, grace periods, overrides, and audit trail.
- Update seed and marketing pricing to Solo `$29/month` and `$278/year`.
- Add Stripe Billing checkout, portal, subscription webhook dispatcher, lifecycle sync, invoice/payment failure handling, and entitlement reconciliation.
- Enforce seats, active tours, custom domains, AI credits, white-label depth, API access, automation, storage, and booking limits server-side.
- Add unit and integration tests for pricing, limits, subscription state mapping, webhook idempotency, and over-limit behavior.

### Phase 2 - Stripe Connect Merchant Payments

- Add `WorkspacePaymentAccount`.
- Implement Express onboarding/refresh/return links, account status sync, dashboard login links, readiness indicators, and disconnected/restricted UX.
- Move traveler checkout to connected-account destination charges per `docs/ADR_STRIPE_CONNECT.md`.
- Add application-fee fields with default zero for Solo unless policy changes.
- Add refunds, partial refunds, disputes, payout/reconciliation status, connected webhooks, and tests.

### Phase 3 - Storefront CMS and Media

- Add guided builder models for brand, pages, navigation, SEO, legal templates, media assets, revisions, publish state, and rollback.
- Implement S3-compatible signed uploads with MIME/magic-byte validation, workspace-prefixed keys, responsive variants, alt text, and cleanup.
- Build desktop/tablet/mobile preview and publish flow.
- Generate tenant-aware metadata, canonical URLs, sitemap, robots, and valid schema only from real data.

### Phase 4 - Custom Domains

- Add operator domain UI/API with normalization, reserved-host checks, duplicate prevention, ownership token generation, and audit logs.
- Implement provider adapter and Cloudflare SaaS Custom Hostnames integration.
- Add DNS/TXT verification, asynchronous TLS health polling, last-check state, and safe removal.
- Add middleware/edge host resolver with active-domain-only routing, unknown-host fallback, and tenant cache safety.
- Add unit, integration, and e2e coverage for domain lifecycle and wrong-tenant leakage.

### Phase 5 - AI System

- Add provider abstraction for OpenAI, OpenRouter, and optional Cloudflare AI Gateway.
- Add encrypted provider config, server-only secret use, model allowlist, timeouts, retry, circuit breaker, metering, cost records, and quota enforcement.
- Implement grounded daily brief, tour copy assistant, itinerary proposal assistant, SEO/FAQ suggestions, email draft assistant, recommendations, feedback, and audit trail.
- Require explicit confirmation before changing tours, prices, schedules, policies, messages, refunds, or publish state.

### Phase 6 - Dashboard and Booking Journey Completion

- Reorganize dashboard around Solo operator jobs: Overview, Website, Tours, Calendar, Bookings, Customers, Payments/Payouts, Messages, Waivers, AI Growth, Analytics, Settings, Billing.
- Build first-run wizard that can publish a Tripistic subdomain storefront.
- Complete customer portal/magic-link booking lookup, cancellation/reschedule request, refund status, ICS calendar file, reminder/review automation, and no-dashboard-dead-end cleanup.
- Gate Operator/Agency modules with real entitlements while preserving data.

### Phase 7 - Hardening and Launch

- Add email verification, password reset, MFA, recovery codes, account export/deletion, recent-auth challenges, CSRF/origin checks, CSP, security headers, structured logging, monitoring hooks, and alert runbooks.
- Add Dockerfile, web/worker process docs, migration release step, health/readiness endpoints, deployment docs, environment docs, backup/restore docs, incident runbook, Stripe setup, custom-domain operations, and public launch checklist/report.
- Add accessibility, responsive, Lighthouse CI, full Playwright launch flows, dependency/security scans, load/concurrency tests, backup restore rehearsal, smoke tests, and rollback rehearsal.

## 10. Immediate Blockers Before Phase 1

- Restore the workspace as a Git checkout so Phase commits and diffs are auditable.
- Provide or create `DATABASE_URL` for a local/CI-like PostgreSQL test database.
- Decide whether to keep the old Bash scripts as secondary helpers. `npm run test:integration` and `npm run test:e2e` now use cross-platform Node runners.
- Clean or explicitly accept the dev dependency audit risk. Production dependencies currently report 0 vulnerabilities.
- Decide production deployment provider and custom-domain provider. Cloudflare SaaS Custom Hostnames is the assumed provider unless changed.
