# Public Launch Phase 1 Progress

Date: 2026-07-27

## Completed in this checkpoint

- Added a shared canonical plan catalog in `lib/plans/catalog.ts`.
- Aligned Solo to `$29/month`, `$278/year`, 14-day trial, 1 workspace, 1 owner seat, 20 active tours, 1 custom domain, white-label storefront, Stripe Connect flag, and basic AI entitlement.
- Replaced marketing pricing hard-codes with projections from the canonical catalog.
- Updated seed data to use Solo, Operator, Agency, and Enterprise from the canonical catalog; previous non-canonical plans are marked inactive by seed.
- Added structured `plan_prices`, `entitlements`, and `usage_meters` tables with forward-only Prisma migrations.
- Added `billing_events` for signed, idempotent Stripe Billing webhook processing separate from traveler payment events.
- Added server-side active-tour and seat reservation entitlement checks.
- Added Stripe Billing checkout and Customer Portal endpoints.
- Added Billing page buttons that redirect owners to Stripe Checkout or the Stripe Customer Portal.
- Updated `.env.example` with Stripe Billing recurring price ID placeholders.
- Replaced Bash-only npm integration/e2e scripts with cross-platform Node runners.
- Added subscription lifecycle fields for billing interval, cancel-at-period-end, payment grace, and failed-payment timestamps.
- Added `subscription_changes` for scheduled renewal-date plan changes tied to Stripe subscription schedules.
- Added owner-only proration preview and scheduled-change API routes.
- Added Billing page controls for Stripe preview-backed renewal-date plan changes.
- Updated Stripe Billing webhook reconciliation to clear grace on paid invoices, set grace on failed invoices, apply scheduled changes from subscription updates, and reconcile subscription schedule events.
- Added admin revenue visibility for pending changes, renewal dates, billing intervals, and grace windows.
- Started Phase 2 Stripe Connect merchant payments with `WorkspacePaymentAccount`.
- Added owner-only Stripe Connect onboarding, refresh, and dashboard-login API routes.
- Added `/dashboard/payments` with payout readiness, requirements, connected-account status, and recent payment reconciliation.
- Routed new paid booking Checkout Sessions through Stripe Connect destination charges when the workspace account is charge-ready.
- Added explicit zero-default platform fee configuration via `TRIPISTIC_PLATFORM_FEE_BPS`.
- Updated traveler payment webhook reconciliation to sync `account.updated` events and snapshot connected charge/transfer/balance transaction IDs.
- Added tenant-scoped owner/admin refund initiation API with Stripe idempotency, reverse-transfer support, application-fee refund support, and local refund ledger rows.
- Added dashboard refund controls for succeeded and partially refunded payments.
- Added connected-account dispute persistence from Stripe dispute webhooks and surfaced recent disputes on the Payments & Payouts dashboard.
- Added recent refund visibility on the Payments & Payouts dashboard.
- Added owner-only live Stripe connected-account balance lookup for available, pending, and instant-available balances.
- Added explicit `TRIPISTIC_CONNECT_COUNTRIES` launch-country policy, defaulting to `US`, and enforced it before Connect account creation.
- Updated the Stripe Connect ADR to reflect the implemented destination-charge core.

## Verification

| Command | Result |
| --- | --- |
| `cmd /c npm run db:generate` | Passed |
| `cmd /c "set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripistic_test&& npx prisma validate"` | Passed |
| `cmd /c npm run test:unit` | Passed: 15 files, 96 tests |
| `cmd /c npm run lint` | Passed |
| `cmd /c npm run typecheck` | Passed |
| `cmd /c npm run build` | Exited 0; still logs known Prisma `DATABASE_URL` warnings during static generation in this environment |
| `cmd /c npm run test:integration` | Blocked: no `DATABASE_URL` configured for a real PostgreSQL test database |
| `cmd /c npm run test:e2e` | Blocked: no `DATABASE_URL` configured for a real PostgreSQL test database |

## Not complete yet

- Stripe Billing webhook tests are unit-level only; full signed webhook and schedule integration tests require PostgreSQL plus Stripe test keys.
- Provider Price IDs must be configured in Stripe and supplied by env vars or `plan_prices.provider_price_id`.
- No Stripe Tax automation is claimed or implemented.
- Coupons/discounts, tax previews, automatic suspension after grace expiry, and cancellation/resume flows are still pending.
- Stripe Connect integration tests need PostgreSQL plus Stripe test keys/webhook fixtures.
- Connected-account payout balance reporting is live-read only; no historical payout ledger or payout arrival-date reconciliation is implemented yet.
- Connected-account evidence submission for disputes remains pending.
- The workspace is still not a Git checkout, so phase commits cannot be created here.

## Next step

Close Phase 2 with database-backed Connect webhook/refund/dispute tests and Stripe test-mode smoke proof once a real PostgreSQL `DATABASE_URL` and Stripe test keys are available, then continue Phase 3 storefront CMS and media.
