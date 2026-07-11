# Tripistic — Phase 4 Completion Report (Stripe Payments + Payment Status Automation)

## 1. Executive status

Phase 4 is **complete and verified**. The payment layer described in
`docs/17_PHASE_4_IMPLEMENTATION_PLAN.md` is implemented end-to-end: a paid
public booking now reserves seats atomically exactly as Phase 3 did, then
routes the guest through a real Stripe Checkout Session, and is confirmed
**only** by a verified, signed Stripe webhook — never on form submission.
Failed or abandoned payments never confirm a booking; unpaid pending
bookings can be expired and their seats released safely; duplicate webhook
deliveries are provably idempotent; and every guarantee Phase 3 built
(atomic reservation, exactly-once cancellation, tenant isolation) is
unchanged and re-verified.

All Phase 1–3 functionality is preserved. The one deliberate behavioral
change is scoped and documented: a public booking with a non-zero total now
starts `pending` (awaiting payment) instead of auto-confirming, exactly as
the master prompt requires ("do not confirm bookings before payment"); a
free booking (`totalAmount === 0`) still confirms immediately, since there
is nothing to pay.

CRM, email delivery, waivers, AI, OTA sync, and SaaS billing were **not
started**, per explicit instruction. See §11.

## 2. Payment flow shipped

1. Guest submits the public booking form exactly as in Phase 3.
2. `createBooking()` — the same canonical service, unmodified except for
   one status-resolution line — reserves seats with the same atomic
   conditional `UPDATE` Phase 3 proved correct.
3. If the booking's total is non-zero, it lands `pending` (not `confirmed`,
   the Phase 3 default). The route then creates a Stripe Checkout Session
   for the exact server-computed total and records a `Payment` row
   (`requires_payment`). The response includes a `checkoutUrl`; a free
   booking's response includes `payment: null` and is already `confirmed`.
4. The guest's browser is redirected to Stripe's hosted Checkout page (a
   full navigation, not a client-side route change) — card data never
   touches this application.
5. Stripe sends signed webhook events to `POST /api/stripe/webhook`. The
   signature is verified against the raw request body before any database
   access.
6. Only on a genuine success event (`checkout.session.completed` with
   `payment_status: "paid"`, or `payment_intent.succeeded`) does the same
   database transaction mark the payment `succeeded` **and** transition the
   booking `pending → confirmed` — atomically, so the two can never be
   observed out of sync.
7. Stripe redirects the guest back to `/book/confirmation/[publicToken]`,
   which shows live payment status (paid/awaiting/failed) and a receipt
   link once succeeded.
8. A failed or declined payment (`payment_intent.payment_failed`) marks the
   payment `failed` but leaves the booking `pending` — the guest can retry
   within the payment window without losing their seats. A booking that is
   never paid is cancelled and its capacity released by the expiration
   sweep once its window passes.
9. Every payment event, success or failure, is recorded append-only in
   `payment_events` and surfaced in the dashboard's payment timeline.

## 3. Schema and migrations

One new migration, `20260711000000_phase4_stripe_payments`, generated via
`prisma migrate diff` against the updated `schema.prisma` (this sandbox
cannot run `prisma migrate dev` interactively — same generation method
used for the Phase 3 migration), applied with `prisma migrate deploy`,
verified against a completely empty database with zero drift (§9). No
existing table, column, or migration was modified.

- **`PaymentStatus` enum**: `requires_payment`, `processing`, `succeeded`,
  `failed`, `cancelled`, `refunded`, `partially_refunded` — exactly the
  seven values the master prompt specifies, no additions. An "expired"
  payment is represented as `status: cancelled` with
  `failure_message: "Payment window expired"` rather than an eighth enum
  value.
- **`payments`** table: `workspace_id`, `booking_id` (composite
  `(workspace_id, booking_id)` foreign key against `bookings(workspace_id,
  id)` — the same tenant-safe pattern Phase 3 established), `provider`
  (plain string, default `"stripe"`, matching the existing
  `Subscription.billingProvider` precedent rather than an enum),
  `provider_payment_intent_id`, `provider_checkout_session_id`, `amount`,
  `currency`, `status`, `payment_method`, `receipt_url`, `failure_code`,
  `failure_message`, `refunded_amount`, `expires_at`, `metadata` (jsonb —
  used only to cache the Checkout Session URL for re-display, never card
  data), timestamps. One booking may accumulate more than one `payments`
  row over its life (a failed/expired attempt followed by a retry creates
  a fresh row); "the current payment" is the latest by `created_at`.
- **`payment_events`** table: append-only webhook receipt log.
  `provider_event_id` carries a **unique** index — this is the sole
  idempotency guard for webhook processing, the same "prove exactly-once
  via a database constraint" pattern Phase 3 used for booking idempotency
  keys. `workspace_id`/`payment_id`/`booking_id` are nullable so an event
  that can't be mapped to a known payment is still recorded, not silently
  dropped.
- Indexes: `payments(workspace_id, booking_id)`,
  `payments(provider_payment_intent_id)`,
  `payments(provider_checkout_session_id)` (both webhook lookup paths),
  `payment_events(payment_id)`, `payment_events(booking_id)`.

## 4. Routes added or changed

**Public** — unchanged request/response shape except for the additions noted:
- `POST /api/public/[workspaceSlug]/bookings` — response gains a `payment`
  object (`status`, `checkoutUrl`, `amount`, `currency`), `null` for a free
  booking.
- `GET /api/public/bookings/[publicToken]` — response gains the same
  `payment` object, re-fetched fresh on every call (not cached from
  creation) so a guest who paid and was redirected back sees `succeeded`
  even if their request lands ahead of the webhook.
- `POST /api/public/bookings/[publicToken]/payment/retry` (new) — issues a
  fresh Checkout Session (or reuses a still-open one) for a `pending`
  booking whose payment failed or expired; 409 once the booking has left
  `pending`.

**Stripe**:
- `POST /api/stripe/webhook` (new) — the only route with no session/tenant
  auth; trust comes entirely from the verified signature.

**Internal**:
- `GET/POST /api/workspaces/[id]/bookings`, `GET
  /api/workspaces/[id]/bookings/[bookingId]`, `POST
  .../bookings/[bookingId]/status` — responses gain `payment` (non-PII
  summary: status, amount, refunded amount — visible to every role that
  can view the booking, including `viewer`) and, on the detail/status
  routes, `paymentDetail` (Stripe references, failure detail, event
  timeline — gated by `canViewBookingPII`, the same tier as guest contact
  info; `null` for `viewer`).
- `POST /api/workspaces/[id]/bookings/[bookingId]/payment-link` (new) —
  owner/admin/staff only; generates a real Checkout Session for a
  `pending` manual booking so an operator can collect payment for a
  phone/walk-in guest. Never a fake capture — it is the identical
  session-creation function the public flow uses.

**Admin**:
- `POST /api/admin/payments/expire-pending` (new) — `platform_admin`-gated
  (mirrors the existing `/api/admin/*` convention); runs the expiration
  sweep across all workspaces. See §6 for why this is admin-triggered
  rather than automatic.

Production build confirms all of the above compile and route correctly
alongside every pre-existing route — **69 routes total**, zero regressions
(§9).

## 5. Stripe webhook handling

Handled event types: `checkout.session.completed`, `payment_intent.succeeded`
(confirm — the redundant-but-safe path for async payment methods where the
session event alone isn't the authoritative success signal),
`payment_intent.payment_failed`, `payment_intent.canceled`,
`charge.refunded`. Every other event type is recorded (via the
`payment_events` row, for observability) and otherwise ignored — Stripe
requires a `2xx` for any event it delivers, recognized or not.

**Idempotency** is a single database transaction per delivery
(`lib/payments/webhook-service.ts::processStripeWebhookEvent`):

1. `payment_events.provider_event_id` is inserted **first**, inside the
   transaction. A redelivery of the same event hits the unique constraint,
   the transaction rolls back before any side effect is attempted, and the
   route returns `200 { duplicate: true }`.
2. Only if that insert succeeds (genuinely new) does the event get
   dispatched by type, and — only on a real success — `confirmPaymentAndBooking`
   marks the payment `succeeded` and calls
   `transitionBookingStatusInTx(tx, ...)` (a new composable export from
   `lib/bookings/status-service.ts` — the existing `transitionBookingStatus`
   is untouched and byte-identical in behavior for every existing caller)
   **inside the same transaction**. This is the load-bearing correctness
   property: the database can never contain `payment.status = "succeeded"`
   while `booking.status` is still `"pending"`.
3. A second, distinct event type confirming the same payment (e.g.
   `checkout.session.completed` then `payment_intent.succeeded` for one
   synchronous card payment) is not a duplicate delivery — it has its own
   `event.id` and is genuinely processed — but its booking transition is
   separately idempotent via `transitionBookingStatus`'s existing
   `alreadyInStatus` short-circuit, so it settles the row once, not twice.

**Verified**
(`tests/integration/payment-webhook.test.ts`, 10 tests): a paid
`checkout.session.completed` confirms the booking and marks the payment
succeeded in one transaction; redelivering the identical event is a
provable no-op (one `payment_events` row, one audit entry, booking
confirmed once); two distinct event types for one payment settle it
exactly once (one extra `booking_status_events` row, not two); an unpaid
`checkout.session.completed` marks `processing`, not `succeeded`; a failed
payment marks `failed` without touching the booking or its capacity; a
full and a partial `charge.refunded` are recorded as `refunded` /
`partially_refunded` with the exact amount, again without touching booking
status; an event matching no known payment is recorded and ignored, not
errored; and — through the real HTTP route with a genuinely
Stripe-SDK-signed payload (`stripe.webhooks.generateTestHeaderString`,
fully offline, no network call) — a valid signature processes normally
and an invalid one is rejected with `400` and zero database writes.

## 6. Capacity safety

Unpaid pending bookings hold their seats for
`PAYMENT_PENDING_EXPIRY_MINUTES` (default 30, clamped up to Stripe's own
30-minute Checkout Session minimum). `lib/payments/expiration.ts`
implements the sweep:

- `expirePendingBooking(paymentId)` is **deliberately not built on top of
  the general `transitionBookingStatus`**. That function's state machine
  allows `confirmed → cancelled` (a legitimate operator action) — if the
  sweep simply called "cancel this booking" on an id it *believed* was
  still pending, a webhook that confirmed the same booking a moment
  earlier would make the sweep's call still succeed as a valid
  `confirmed → cancelled` transition, silently cancelling and
  releasing-by-mistake a booking whose guest just paid. Instead it runs a
  narrower, purpose-built conditional update scoped to exactly
  `pending → cancelled`:
  ```sql
  UPDATE bookings SET status = 'cancelled', cancelled_at = now()
  WHERE id = $id AND workspace_id = $workspaceId AND status = 'pending'
  RETURNING id, availability_id, participant_count
  ```
  Zero rows back means the booking already left `pending` (a webhook
  confirmed it, or it was already cancelled) — a safe no-op, not an error.
  This is race-safe against the webhook specifically *because* §5's
  invariant holds: a booking can only leave `pending` for `confirmed` in
  the same transaction its payment became `succeeded`, so "still pending"
  here is proof the payment has not succeeded.
- On an actual expiry, the same transaction releases capacity with the
  identical `GREATEST(booked_count - seats, 0)` conditional update Phase 3
  already uses for cancellation, marks the booking's payment `cancelled`
  with `failure_message: "Payment window expired"`, writes one
  `BookingStatusEvent`, and records `payment_expired` in the audit log
  after commit.
- `sweepExpiredPendingBookings()` finds every `Payment` with status
  `requires_payment`/`processing` whose `expires_at` has passed and whose
  booking is still `pending`, across all workspaces, and processes each
  through `expirePendingBooking` in its own transaction (one booking's
  outcome can't roll back another's).
- Exposed via `POST /api/admin/payments/expire-pending`
  (`platform_admin`-gated, mirrors the existing `/api/admin/*` route
  convention) — the "admin-safe cleanup endpoint" the master prompt asks
  for. There is no in-process scheduler anywhere in this Next.js
  application; wiring a recurring trigger (Vercel Cron, a hosting
  platform's scheduled job, etc.) to call this endpoint is a
  deployment-time task, not built in this phase. Documented as a known gap
  in §10.

**Verified** (`tests/integration/payment-expiration.test.ts`, 4 tests): an
expired unpaid booking is cancelled and its capacity released exactly
once, and calling expiration again on the same payment is a safe no-op;
**the expire-vs-webhook race is proven directly** — a booking whose
payment is confirmed via a simulated webhook is *not* touched by a
subsequent expiration attempt on the same (now-expired) payment row,
capacity stays exactly where the webhook left it; a payment already
`failed`/settled by an earlier webhook is correctly skipped by expiration
too; and a sweep across multiple candidates expires only the genuinely
expired, still-pending ones.

## 7. Dashboard updates

- **Bookings list** (`/dashboard/bookings`) — new "Payment" column
  (status badge) per row; summary cards gain "Collected" (sum of succeeded
  payments) alongside the existing booked-value card; the stale "payments
  arrive in Phase 4" hint is gone.
- **Booking detail** (`/dashboard/bookings/[bookingId]`) — new "Payment"
  section: status badge, amount, refunded amount if any, Stripe payment
  intent reference and failure reason (PII-gated), a link to Stripe's own
  guest-facing receipt once succeeded, and the payment event timeline. A
  "Generate payment link" action appears for owner/admin/staff on a
  `pending` unpaid booking, producing a real, copyable Stripe Checkout URL
  — never a fake "mark as paid."
- **Dashboard home** — the "Revenue" metric card, previously a hard-coded
  `pendingPhase="Phase 4"` placeholder, now shows the real sum of
  succeeded payments for the workspace.
- **Public confirmation page** (`/book/confirmation/[publicToken]`) — shows
  live payment status: a "Complete payment" link back to an open Checkout
  Session, a "Try payment again" action (issues a fresh session) on
  failure, and the Stripe receipt link once paid. Heading and icon adapt
  to `awaiting payment` / `confirmed` / `cancelled`.
- **Public booking form** — redirects the browser to the Stripe Checkout
  URL for a paid booking instead of navigating straight to the
  confirmation page; button label and helper copy reflect whether payment
  follows.
- Stale placeholder copy referencing "Phase 4" as a future capability
  (dashboard, billing, onboarding pages) was corrected to describe what's
  actually live, and the onboarding checklist's "Connect Stripe" item was
  re-scoped to accurately describe the still-future capability it was
  really describing (per-operator Stripe Connect payouts with 0%
  commission — explicitly out of scope for this phase, see §11) rather
  than the guest-payment-collection capability that is now live and needs
  no "connecting" step at all.

## 8. Security notes

- Webhook signature verified (`stripe.webhooks.constructEvent`) against
  the **raw** request body before any parsing or database access; a bad or
  missing signature is rejected with `400` and touches nothing.
- Every amount sent to Stripe is read from the `Booking`/`Payment` row on
  the server; the public booking request schema has no price field to
  strip in the first place (unchanged from Phase 3).
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are never returned in any API
  response; no card data is ever received or stored by this application —
  only Stripe's own references and its guest-facing receipt URL.
- Public serializers (`lib/payments/serializers.ts`) expose payment
  `status`/`amount`/`checkoutUrl`/`receiptUrl` to a booking's own guest,
  but never `providerPaymentIntentId`/`providerCheckoutSessionId`/
  `failureCode`/raw event payloads — those stay behind
  `canViewBookingPII` internally, same tier as guest contact info.
- Every `Payment`/`PaymentEvent` lookup that serves a response is scoped
  by the `workspaceId` already stored on the row it resolves — never from
  anything a caller (including the webhook payload) claims. Proven in
  `tests/integration/payment-flow.test.ts`: a payment created under
  workspace A returns `404` with zero data when looked up through
  workspace B's internal API.
- The confirmation page keeps its existing `noindex,nofollow`.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is reserved in `.env.example` but
  unused this phase — the flow is fully server-redirect-driven Stripe
  Checkout, so no Stripe.js loads client-side at all.

## 9. Tests added

| Suite | File | Count |
|---|---|---|
| Unit | `tests/unit/stripe-amount.test.ts` | 3 |
| Unit | `tests/unit/webhook-idempotency.test.ts` | 6 |
| Unit | `tests/unit/payment-serializers.test.ts` | 9 |
| Integration | `tests/integration/payment-flow.test.ts` | 7 |
| Integration | `tests/integration/payment-webhook.test.ts` | 10 |
| Integration | `tests/integration/payment-expiration.test.ts` | 4 |

- **`stripe-amount`**: zero-decimal currency conversion (`toStripeAmount`)
  — our uniform "always divide by 100" storage convention vs. Stripe's
  per-currency convention, including rounding.
- **`webhook-idempotency`**: the `P2002`-on-`provider_event_id` detection
  helper, mirroring the existing booking-idempotency-violation pattern.
- **`payment-serializers`**: public payment redaction (checkoutUrl only
  while payable, receiptUrl only once succeeded, never internal Stripe
  ids) and internal PII gating (`viewer` gets `null` detail; owner/admin/staff
  get Stripe references and the event timeline).
- **`payment-flow`**: a paid public booking creates a `pending` booking +
  `requires_payment` payment with a checkout URL (Stripe client mocked —
  this sandbox has no real Stripe account); a free booking confirms
  immediately with zero Stripe calls; an idempotent replay reuses the
  existing session instead of creating a second `Payment` row; a manual
  booking's payment-link generation (and its `viewer`-is-403 rejection);
  dashboard payment-field role-gating; cross-tenant payment lookup
  rejection.
- **`payment-webhook`**: see §5 for the full list — success confirms
  atomically, redelivery is idempotent, two event types settle once,
  unpaid-session marks `processing`, failure/refund never touch booking
  status, unmapped events are recorded and ignored, and the real HTTP
  route's signature verification (valid passes, invalid is rejected with
  zero writes).
- **`payment-expiration`**: see §6 — exactly-once expiry and release, the
  expire-vs-webhook race proven directly, already-settled payments
  skipped, and a multi-candidate sweep only touches the genuinely expired.

**Every existing Phase 3 test still passes**, with the minimum necessary
updates for the new payment-gated behavior (not a weakening of any
guarantee): `booking-lifecycle.test.ts`'s creation tests now assert a paid
public booking lands `pending` (previously `confirmed`) and that a forged
`status` field is still ignored (now proven by the result being `pending`,
not the forged `completed`); its `transitionBookingStatus`/`cancelBooking`
describe block's helper now uses a free tour so it genuinely starts
`confirmed`, matching what that block is actually testing (the
confirmed→completed/no-show/cancelled state machine, unaffected by
payment gating); `booking-routes.test.ts`'s two tests that exercise the
public creation route directly use a free tour so they stay
Stripe-independent (they test honeypot/idempotency/redaction, not
payment); `booking-concurrency.test.ts` and
`booking-protects-phase2.test.ts` needed **zero changes** — neither ever
asserted `status === "confirmed"`, and `pending` holds capacity and
releases it under cancellation exactly like `confirmed` did. The
Playwright critical-flow fixture (`prisma/seed-e2e.ts`) now seeds a free
tour and add-on — documented inline as a deliberate scope boundary: this
sandbox has no real Stripe test-mode credentials to drive an actual
hosted Checkout page through a browser, so the paid-flow proof lives in
the mocked-Stripe-client and real-signed-webhook integration tests instead
(§5–§6), while the existing e2e spec continues to prove the full
browser journey (form → reservation → confirmation → dashboard →
cancellation → capacity restore) end to end.

Commands: `npm run test:unit`, `npm run test:integration`, `npm run
test:e2e`, `npm run test:ci`. CI's `env:` block gained the same
well-formed-but-fake Stripe test values as `.env.test` (a real webhook
secret works for offline HMAC signing; checkout-session creation is
mocked in the tests that need it) so both GitHub Actions jobs run
unchanged.

## 10. Verification results

Run against the sandbox's Postgres 16 instance, migrations applied fresh:

```
$ npm run lint            → clean, no errors or warnings
$ npm run typecheck       → clean, no errors
$ npm run test:unit       → 7 files, 62 tests passed (44 existing + 18 new)
$ npm run test:integration → 5 migrations applied (no pending/no drift),
                             11 files, 73 tests passed (52 existing + 21 new)
$ npm run test:e2e        → 1/1 passed, run twice consecutively for stability
$ npm run build           → succeeded, 69 routes, middleware 87.1 kB,
                             no route conflicts
$ npm audit                → 4 moderate findings (same pre-documented
                             next/postcss transitive chain as Phase 2.1/3 —
                             no new advisory from the `stripe` dependency)
```

**Fresh-database verification** (this session, separate from the
`tripistic_test` integration run): a brand-new database was created,
`prisma migrate deploy` applied all 5 migrations cleanly from empty,
`prisma db seed` succeeded, `prisma format --check` and a
`prisma migrate diff` against that live database both confirmed
**zero drift** between `schema.prisma` and the applied migrations, and the
temporary database was dropped afterward.

## 11. Known gaps

- **No in-process scheduler.** `POST /api/admin/payments/expire-pending`
  exists and is fully tested, but nothing calls it on an interval yet —
  wiring a real cron/scheduled trigger is a deployment-time task for
  whichever platform this ships to (Vercel Cron, a GitHub Actions
  schedule, etc.), not application code.
- **No Stripe Connect / per-operator payouts.** Every workspace's guest
  payments flow through this deployment's single `STRIPE_SECRET_KEY` —
  there is no per-operator connected Stripe account, so Tripistic (not
  each tour operator) is the merchant of record today. Direct payouts to
  operators with 0% Tripistic commission require Stripe Connect, which
  the master prompt explicitly excludes from this phase ("Marketplace
  payouts," "Split payments"). The onboarding checklist item describing
  this was corrected to reflect that it's still a future capability, not
  something this phase claims to deliver.
- **No real end-to-end browser proof of the paid flow.** This sandbox has
  no real Stripe test-mode API keys, so Playwright cannot drive an actual
  hosted Checkout page. The paid flow's correctness is proven instead by
  integration tests with a mocked Stripe client (session creation) and a
  genuinely-signed webhook payload (event processing) — see §5, §9.
  Re-running the Playwright spec against a real Stripe test-mode account
  once one is available would close this gap without any code changes.
- **`receipt_url` is not auto-populated from the webhook.** Fetching it
  reliably requires an extra Stripe API call (expanding the charge) that
  the webhook handler deliberately avoids making, to keep webhook
  processing free of any outbound network dependency. The database column
  and serializer field exist for a future enhancement; Stripe's own
  emailed receipt to the guest is the authoritative receipt in the
  meantime.
- **No deposits/partial payments/split payments.** Every paid booking
  charges its full total in one Checkout Session, matching the master
  prompt's MVP scope exactly ("Recommended MVP: Stripe Checkout first").
- **Zero-decimal currency handling is now correct for Stripe specifically**
  (`toStripeAmount`), but the rest of the app (`formatMoney` and every
  price-entry form) still treats all currencies uniformly as if 2-decimal
  — a pre-existing Phase 1–3 simplification, unchanged by this phase, and
  only reachable if a workspace is configured with a zero-decimal currency
  like JPY.

## 12. What was explicitly NOT built (Phase 5+)

Per the master prompt's explicit exclusion list, none of the following
were implemented, stubbed, or partially scaffolded: CRM module, email/SMS
delivery, digital waiver signing, the AI Growth Dashboard, an AI booking
assistant, OTA sync, SaaS subscription billing for Tripistic's own
tenants, white-label custom domain billing, full accounting integration,
complex refund automation, split payments, or marketplace payouts.

## 13. Recommended Phase 5

The natural next slice, per the existing roadmap (`docs/08`) and this
phase's own data model, is **CRM & communication**: a `Customer` record
(today, guest identity lives only on each `Booking` row with no
cross-booking history), and — now that a real "money received" event
exists — the first genuinely valuable automated email: a payment
confirmation sent the moment a booking transitions to `confirmed`,
reusing the exact same webhook-driven transition this phase built rather
than adding a second trigger path. That keeps Phase 5's first milestone
narrow and concrete instead of a re-architecture, the same way this phase
kept its first milestone scoped to "wire an existing transition to a
verified external event."
