# ADR: Stripe Connect For Workspace Merchant Payments

Date: 2026-07-27
Status: Accepted; core Phase 2 implementation complete pending external Stripe/PostgreSQL integration proof

## Context

Tripistic currently creates Stripe Checkout Sessions with the platform Stripe account for traveler booking payments. That confirms bookings correctly through signed webhooks, but it does not satisfy the public-launch requirement that each operator connects their own Stripe account and receives traveler funds through Stripe Connect.

Tripistic also needs separate SaaS billing for its own subscriptions. Subscription billing and traveler booking payments must not share route handlers, webhook business logic, or entitlement assumptions.

## Decision

Use Stripe Connect Express accounts for workspace merchants.

Tripistic will keep `Workspace` as the tenant and merchant boundary and add a one-to-one `WorkspacePaymentAccount` model storing safe Stripe identifiers and status metadata only:

- Stripe connected account ID.
- onboarding status.
- charges/payouts enabled flags.
- capability and requirements summaries.
- default currency/country.
- disabled/restricted reason.
- last synced timestamp.

Implemented core:

- `WorkspacePaymentAccount` stores safe Stripe Express account identifiers, requirements, capabilities, and readiness flags.
- Owner-only onboarding, refresh, and dashboard-login routes create links just in time.
- Paid booking Checkout Sessions use destination charges with `transfer_data[destination]` when the workspace account is charge-ready.
- `application_fee_amount` is explicit and defaults to zero through `TRIPISTIC_PLATFORM_FEE_BPS=0`.
- Stripe `account.updated` webhooks sync connected-account readiness.
- Payment rows snapshot connected account, platform fee, charge, transfer, and balance transaction identifiers when available.
- Owner/admin refund API supports full and partial refunds with Stripe idempotency, reverse transfers, application-fee refunds, and local refund rows.
- Stripe dispute webhooks persist connected-account dispute state and surface recent disputes in the dashboard.
- Owner-only payout balance lookup reads live available, pending, and instant-available balances from Stripe without storing balance snapshots.
- Connect onboarding is restricted by `TRIPISTIC_CONNECT_COUNTRIES`; launch default is `US` until legal, Stripe, and support readiness expand the policy.

Operators will never paste Stripe secret keys. Card data will never be stored by Tripistic.

## Charge Type

Use destination charges by default:

- Tripistic creates the Checkout Session on the platform account.
- The PaymentIntent uses `transfer_data[destination]` to route funds to the connected account.
- `application_fee_amount` is explicit and defaults to 0 for Solo unless commercial policy changes.
- Booking/payment records store immutable snapshots of amount, currency, taxes/fees/discounts, Tripistic platform fee, Stripe fee estimate when available, connected account ID, and charge/payment intent IDs.

This keeps Checkout and webhook handling centralized while still routing funds to the workspace merchant.

## Merchant of Record

The workspace operator is treated as the merchant providing the travel service. Tripistic is the SaaS platform and payment facilitator through Stripe Connect. Legal pages and dashboard copy must not imply Tripistic provides the tour or guarantees operator policies.

## Refunds and Disputes

- Refunds must be initiated server-side by authorized workspace owners/admins or platform admins.
- Partial refunds are supported.
- Refund records must not automatically cancel bookings; booking status changes remain explicit business actions.
- Dispute webhooks must attach dispute state to the workspace payment record and booking/payment timeline.
- Payout balances are read live from Stripe for the connected account; Tripistic does not treat cached balance displays as settlement truth.
- Evidence submission support can be staged after basic dispute visibility, but dispute events must be persisted from day one.

## Negative Balances

Connected-account negative balance behavior depends on Stripe account country and platform settings. Tripistic must surface restricted/negative-balance states and block new paid checkout when Stripe reports the account is not charge-ready.

## Regional Availability

Stripe Connect Express is available only in supported countries. Workspace onboarding validates country against `TRIPISTIC_CONNECT_COUNTRIES` and returns a clear unsupported-country error instead of collecting unusable payment setup data. The public-launch default is `US`; expanding this list is a business/legal/support configuration change, not a code change.

## Webhooks

Use signed Stripe webhooks for both:

- Platform subscription billing events.
- Connect/payment events, including events carrying `account` for connected accounts.

Webhook processing must be idempotent through persisted event IDs, replay-safe, tolerant of out-of-order events, and mapped by existing persisted Stripe IDs rather than trusting workspace IDs from event metadata.

## Consequences

- SaaS subscription billing and connected traveler payments now use separate route/service paths.
- `Payment`, `PaymentEvent`, `WorkspacePaymentAccount`, `PaymentRefund`, and `PaymentDispute` preserve connected-account state, platform fees, refunds, disputes, and reconciliation details.
- Public pricing and billing copy must stay aligned with `TRIPISTIC_PLATFORM_FEE_BPS` and the active Connect country policy.
- CI needs offline Stripe mocks for checkout, account links, login links, refunds, disputes, and signed webhook payloads.
