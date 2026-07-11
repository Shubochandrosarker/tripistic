# Tripistic — Phase 4 Implementation Plan (Stripe Payments + Payment Status Automation)

> Written before Phase 4 coding, per the Phase 4 master prompt's required first step. Read in full: `docs/16_PHASE_3_COMPLETION_REPORT.md`, `docs/14_PHASE_3_IMPLEMENTATION_PLAN.md`, `docs/15_PHASE_2_1_HARDENING_REPORT.md`, `prisma/schema.prisma`, `lib/bookings/service.ts`, `lib/bookings/status-service.ts`, `lib/bookings/status.ts`, the internal/public booking API routes, the dashboard bookings pages, `lib/auth/permissions.ts`, `lib/audit/audit-log.ts`, `.env.example`.

## 1. Existing Phase 3 architecture summary (what this phase must not break)

- `createBooking()` (`lib/bookings/service.ts`) is the **one** canonical reservation path — a single `prisma.$transaction` that re-verifies workspace/tour/availability fresh, computes price server-side only, reserves capacity with one conditional `UPDATE ... WHERE booked_count + $seats <= capacity RETURNING id`, then inserts the `Booking` + children. It currently forces `status: "confirmed"` for every `source: "public_direct"` booking (line: `input.source === "public_direct" ? "confirmed" : ...`) — there was no payment gate yet, so nothing to wait for.
- `transitionBookingStatus()` (`lib/bookings/status-service.ts`) is the **one** status-change path (also used for cancellation). It opens its own `prisma.$transaction`, does a conditional `updateMany({ where: { id, workspaceId, status: existing.status } })` so a concurrent duplicate call can flip the row at most once, releases capacity via `GREATEST(booked_count - seats, 0)` only when the transition lands on `cancelled`, writes a `BookingStatusEvent`, and calls `recordAuditEvent` **after** its transaction commits.
- `lib/bookings/status.ts` is the single state-machine table: `pending → confirmed | cancelled`, `confirmed → cancelled | completed | no_show`, all others terminal. `holdsCapacity(status)` is true for `pending` and `confirmed`.
- Public/internal serializers (`lib/bookings/serializers.ts`) already separate a public-safe shape (`serializePublicBookingConfirmation`, no guest PII, no internal IDs beyond `publicToken`) from an internal shape (`serializeBookingListItem`/`serializeBookingDetail`, PII gated by `canViewBookingPII`).
- Permissions: `canManageBookings` = owner/admin/staff, `canViewBookings` = + viewer, `canViewBookingPII` = excludes viewer (`lib/auth/permissions.ts`).
- Tenant safety: `Booking.tour`/`Booking.availability` use composite `(workspaceId, id)` foreign keys — a booking cannot reference another tenant's tour/availability even if application code has a bug.
- `.env.example` already reserves blank `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` lines, commented "placeholders only for now."

**Everything above is preserved as-is.** Phase 4 adds a payment layer and changes exactly one behavior in the existing service: what status a **paid** public booking starts in.

## 2. Stripe integration approach

**Stripe Checkout (`mode: "payment"`), not Payment Elements**, per the master prompt's explicit MVP recommendation — less custom payment UI, lower PCI scope, faster to ship correctly. The guest is redirected to a Stripe-hosted page and back; we never touch card data.

Server SDK: `stripe` npm package (Node SDK), used only in route handlers and `lib/payments/*` service functions — never imported into a client component. `lib/payments/stripe-client.ts` constructs the client lazily (inside the function that needs it, not at module load) from `process.env.STRIPE_SECRET_KEY`, so the app still boots and every non-payment route still works with no Stripe key configured (matching the existing "optional integration" convention already documented in `.env.example`'s header comment). Calling a payment function with no key configured throws a clear 500-class error caught by the route's existing `handleApiError`.

This sandbox has no real Stripe account or API keys. Every Stripe network call (`checkout.sessions.create`, `.retrieve`) is therefore wrapped behind a single injectable interface so integration tests can supply a stub — the *webhook signature verification and event-processing logic*, which is the part that actually matters for correctness, needs no network access at all and is tested for real using Stripe's own offline HMAC test-header helper (`Stripe.webhooks.generateTestHeaderString`).

## 3. Payment lifecycle design

```
Guest submits booking form
  -> createBooking() reserves seats atomically, booking lands as:
       - "confirmed" immediately if totalAmount === 0 (free tour — nothing to pay, unchanged from Phase 3 behavior)
       - "pending" if totalAmount > 0 (NEW — awaiting payment)
  -> if pending: create a Stripe Checkout Session for the booking total, store a Payment row
       (status "requires_payment"), return the session URL to the guest
  -> guest is redirected to Stripe, pays
  -> Stripe sends a signed webhook to POST /api/stripe/webhook
  -> webhook handler verifies the signature, records the event exactly once (unique index on
     provider_event_id), and — only on a genuine success event — atomically marks the Payment
     "succeeded" AND transitions the booking pending -> confirmed in the SAME database transaction
  -> guest is redirected back to /book/confirmation/[publicToken], which now shows live payment status
  -> if the guest never completes payment, the booking's payment window (PAYMENT_PENDING_EXPIRY_MINUTES,
     default 30) expires; an admin-triggered sweep cancels the still-pending booking through a dedicated
     narrow transition and releases capacity exactly once
```

Manual (operator) bookings are unaffected by default — they keep landing as `confirmed`/`pending` exactly per the operator's explicit choice, as today. Phase 4 adds an *optional* "Generate payment link" action on a manual booking so an operator can still collect card payment for a phone/walk-in booking without faking capture.

## 4. Booking status changes needed

**No new `BookingStatus` enum values.** Per the master prompt: "keep existing statuses if possible." `pending` now legitimately means two things depending on `source`/history — "operator soft hold" (Phase 3, unchanged) or "reserved, awaiting payment" (new) — both already correctly hold capacity (`holdsCapacity("pending") === true`) and both already correctly release it on cancellation through the existing state machine. No disambiguation is needed at the booking-status level because the **Payment** row is the source of truth for *why* a booking is pending.

The only code change to the state machine's *inputs*: `lib/bookings/service.ts`'s status-resolution line, from unconditionally forcing `"confirmed"` for `source: "public_direct"`, to `totalAmount > 0 ? "pending" : "confirmed"` for that source. `input.status` (manual bookings' explicit operator choice) is untouched.

## 5. Payment status enum design

```prisma
enum PaymentStatus {
  requires_payment
  processing
  succeeded
  failed
  cancelled
  refunded
  partially_refunded

  @@map("payment_status")
}
```

Exactly the seven values the master prompt specifies — no additions. "Expired" is deliberately **not** a payment status: an expired payment is represented as `status: cancelled` with `failureMessage: "Payment window expired"`, because the master prompt's own status table only lists `cancelled`/`failed` as the money-lifecycle end states for an unpaid booking, and inventing an eighth value violates "do not create too many...statuses unless necessary."

`provider` is a plain `String @default("stripe")` (not an enum) — this matches the existing precedent in this exact codebase, `Subscription.billingProvider String?`, and keeps the door open for a second provider later without a migration to widen an enum.

## 6. Database schema changes

Two new models, one new enum, one additive relation on `Booking`/`Workspace`. No existing column renamed, dropped, or retyped.

```prisma
model Payment {
  id                         String        @id @default(cuid())
  workspaceId                String        @map("workspace_id")
  bookingId                  String        @map("booking_id")
  provider                   String        @default("stripe")
  providerPaymentIntentId    String?       @map("provider_payment_intent_id")
  providerCheckoutSessionId  String?       @map("provider_checkout_session_id")
  amount                     Int
  currency                   String
  status                     PaymentStatus @default(requires_payment)
  paymentMethod              String?       @map("payment_method")
  receiptUrl                 String?       @map("receipt_url")
  failureCode                String?       @map("failure_code")
  failureMessage             String?       @map("failure_message")
  refundedAmount              Int?          @map("refunded_amount")
  expiresAt                   DateTime?     @map("expires_at") @db.Timestamptz(6)
  metadata                    Json?
  createdAt / updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  booking   Booking   @relation(fields: [workspaceId, bookingId], references: [workspaceId, id], onDelete: Cascade)
  events    PaymentEvent[]

  @@index([workspaceId, bookingId])
  @@index([providerPaymentIntentId])
  @@index([providerCheckoutSessionId])
  @@map("payments")
}

model PaymentEvent {
  id               String    @id @default(cuid())
  workspaceId      String?   @map("workspace_id")   // nullable: an event we can't map to a known payment is still recorded
  paymentId        String?   @map("payment_id")
  bookingId        String?   @map("booking_id")
  provider         String    @default("stripe")
  providerEventId  String    @unique @map("provider_event_id")   // the idempotency guard
  eventType        String    @map("event_type")
  payload          Json
  processedAt      DateTime? @map("processed_at") @db.Timestamptz(6)
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  workspace Workspace? @relation(fields: [workspaceId], references: [id], onDelete: SetNull)
  payment   Payment?   @relation(fields: [paymentId], references: [id], onDelete: SetNull)

  @@index([paymentId])
  @@index([bookingId])
  @@map("payment_events")
}
```

**Design decisions beyond the master prompt's literal field list, each narrow and justified:**
- `Payment.expiresAt` — the master prompt's capacity-expiration section says "add `payment_expires_at` on booking or payment"; placed on `Payment` (not `Booking`) because expiry is a property of a specific payment attempt, and a booking can accumulate more than one `Payment` row over its life (e.g., a failed attempt followed by a retry with a fresh Checkout Session) — the expiration sweep always looks at the *latest* payment for a still-pending booking.
- `Payment.refundedAmount` — needed to distinguish `refunded` (full) from `partially_refunded` and to show "amount paid" accurately on the dashboard; not listed explicitly among the master prompt's payments fields but implied by the `partially_refunded` status existing at all.
- One booking : many payments (not a 1:1 FK on `Booking`) — models retries honestly (a new Checkout Session after a failed/expired attempt is a new `Payment` row) without ever mutating a settled payment record. "The current payment for a booking" is simply the latest `Payment` row by `createdAt`; no denormalized pointer column is added to `Booking` to avoid a circular-update dependency between the two tables.
- Checkout Session URLs are **not** stored as a dedicated column — Stripe only returns a session's `url` at creation (or via `expand`), so it's cached inside `Payment.metadata.checkoutUrl` (already-specified JSON field) purely to redisplay the same link on a page reload without an extra Stripe round trip, not treated as durable state.
- Both FK relations use composite `(workspaceId, ...)` where they point at `Booking`, continuing the Phase 3 tenant-safety pattern — a `Payment` cannot reference a `Booking` from a different workspace even by application bug.

Migration `..._phase4_stripe_payments`, generated the same way as Phase 3's migration (`prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url ... --script`, since this sandbox cannot run `prisma migrate dev` interactively), hand-placed into a migration folder, applied with `prisma migrate deploy`. No edits to any existing migration.

## 7. Routes to add/change

**Public**
- `POST /api/public/[workspaceSlug]/bookings` — unchanged input contract; response gains a `payment` object (`status`, `checkoutUrl`, `amount`, `currency`) that is `null` for a free booking that's already confirmed.
- `GET /api/public/bookings/[publicToken]` — response gains the same `payment` object, refreshed on every call (so a guest who paid and returned sees `succeeded` without needing the webhook to have raced ahead of their redirect).
- `POST /api/public/bookings/[publicToken]/payment/retry` (new) — for a `pending` booking whose latest payment is `failed`/`cancelled`/expired-but-not-yet-swept, creates a fresh Checkout Session. Rejects (409) if the booking is no longer `pending` (already paid, already cancelled) or already has a live, unexpired session.

**Stripe**
- `POST /api/stripe/webhook` (new) — the only route in the app that reads a raw (unparsed) request body, required for Stripe's signature scheme. No session/tenant auth — authenticity comes entirely from the signature.

**Internal**
- `GET /api/workspaces/[id]/bookings` / `GET .../bookings/[bookingId]` — response gains a `payment` summary (status, amount, amount paid) for every role that can view the booking, and full detail (Stripe references, receipt URL, failure reason, event timeline) gated by `canViewBookingPII`, matching the master prompt's "viewer sees limited summary only."
- `POST /api/workspaces/[id]/bookings/[bookingId]/payment-link` (new) — owner/admin/staff (`canManageBookings`) only; creates a Checkout Session for a `pending`, unpaid manual booking so the operator can send the guest a real payment link. Rejected for a booking that isn't `pending` or whose `totalAmount` is 0.

**Admin**
- `POST /api/admin/payments/expire-pending` (new) — `requirePlatformAdminApi()`-gated (mirrors the existing `/api/admin/*` convention), runs the expiration sweep across all workspaces, returns a count of expired bookings. This is the "admin-safe cleanup endpoint" the master prompt asks for; wiring a real scheduler (Vercel Cron / a GitHub Actions schedule / an external uptime-ping) to call it on an interval is a deployment concern documented as a known gap, not built here — there is no scheduler infrastructure anywhere else in this codebase to hook into.

## 8. Webhook strategy

`app/api/stripe/webhook/route.ts`: read the raw body text (`await request.text()`, never `request.json()` — Stripe's signature is computed over the exact raw bytes), verify with `stripe.webhooks.constructEvent(rawBody, signatureHeader, process.env.STRIPE_WEBHOOK_SECRET)`. An invalid/missing signature is rejected with 400 before any DB access.

Idempotency and processing are one `prisma.$transaction`:
1. `tx.paymentEvent.create({ providerEventId: event.id, ... })` first. Stripe's `event.id` is globally unique and stable across redeliveries; the DB's unique index makes a second delivery of the same event hit `P2002`, which the route catches and returns `200 { duplicate: true }` with zero further side effects — proving exactly-once processing the same way Phase 3 proved exactly-once idempotency for booking creation (a DB unique constraint, not an in-memory check).
2. Only if step 1 succeeds (this is genuinely new): dispatch on `event.type` (see §5 of this doc's "events handled" list below), update the matched `Payment` row, and — only for a genuine success — call `transitionBookingStatusInTx(tx, { toStatus: "confirmed", actor: { kind: "system" } })` (a new export from `status-service.ts`, see §9) so the payment update and the booking transition commit or roll back together. This is the load-bearing correctness property: **it is never possible for the database to contain `payment.status = "succeeded"` while `booking.status` is still `"pending"`** — the two always change in the same transaction.
3. `recordAuditEvent` for the meaningful outcome (payment succeeded/failed/refunded) fires after the transaction commits, following the same "audit after commit" convention as the rest of the codebase.

Events handled (Checkout mode): `checkout.session.completed` (confirm if `payment_status === "paid"`, else mark `processing`), `payment_intent.succeeded` (confirm — the authoritative "money received" signal, and the redundant-but-safe path for async payment methods), `payment_intent.payment_failed` (mark the payment `failed` with `failure_code`/`failure_message`; **does not** touch the booking — the guest can still retry within the expiration window), `payment_intent.canceled` (mark the payment `cancelled`; booking untouched, same reasoning), `charge.refunded` (mark `refunded`/`partially_refunded` by comparing `amount_refunded` to `amount`; booking status is **never** auto-changed on refund, matching the master prompt exactly — an operator cancels separately if that's the intent). Every other event type is recorded (for the audit trail) and otherwise ignored — Stripe requires a `2xx` for any event type it delivers, recognized or not.

`Payment` lookup for an incoming event tries, in order: `providerPaymentIntentId` (from `payment_intent.*` events, or `charge.payment_intent` for refunds), then `providerCheckoutSessionId` (from `checkout.session.*` events). Both are populated on the `Payment` row at Checkout Session creation time (`session.payment_intent` is present as a string ID immediately in `mode: "payment"`, no `expand` required) — so either lookup path resolves the same row from the first webhook onward. An event that matches no `Payment` row is logged (via the still-inserted `PaymentEvent`) and ignored, not errored — it may belong to a different Stripe account/mode than this deployment, and 500-ing would make Stripe retry forever.

## 9. Capacity release strategy for unpaid bookings

**Deliberately not implemented by reusing the general `transitionBookingStatus` for the expiration sweep.** Reasoning: that function's state machine allows `confirmed -> cancelled` (a legitimate operator action), so if the sweep simply called `cancelBooking(bookingId)` on a booking id it *thought* was still pending-and-unpaid, a race where the webhook confirms the booking a moment earlier would make the sweep's call still succeed as a valid `confirmed -> cancelled` transition — silently cancelling and refunding-by-capacity-release a booking whose guest just paid. That failure mode is exactly the class of bug Phase 3's atomic-reservation work was built to eliminate, so Phase 4 does not reintroduce an equivalent one.

Instead, `lib/payments/expiration.ts::expirePendingBooking(bookingId)` runs a **narrower, purpose-built conditional transition**, scoped to exactly `pending -> cancelled`, inside its own transaction:

```sql
UPDATE bookings SET status = 'cancelled', cancelled_at = now()
WHERE id = $id AND workspace_id = $workspaceId AND status = 'pending'
RETURNING id, availability_id, participant_count
```

If zero rows return, the booking already left `pending` (paid and confirmed by a webhook that won the race, or already cancelled by someone else) — the sweep silently skips it; this is not an error. This invariant holds because of §8's guarantee: a booking can only reach `confirmed` in the same transaction its payment became `succeeded`, so `status = 'pending'` in the `WHERE` clause is proof the payment has not succeeded, without needing to separately re-check the `Payment` row.

If one row returns: within the *same* transaction, release capacity with the identical `GREATEST(booked_count - seats, 0)` conditional update Phase 3 already uses for cancellation, mark the booking's latest `Payment` row `cancelled` with `failureMessage: "Payment window expired"` (only if it's still `requires_payment`/`processing` — it structurally must be, by the same invariant), write one `BookingStatusEvent` (`pending -> cancelled`, actor `system`, note `"Payment window expired"`), commit, then `recordAuditEvent("payment_expired", ...)` after commit.

The sweep's query for *candidates* (`sweepExpiredPendingBookings()` in the same file): all `Payment` rows with `status IN (requires_payment, processing)` and `expiresAt < now()` whose `booking.status = 'pending'`, across all workspaces (this is a platform-level maintenance operation, not a per-workspace one) — each candidate is then processed through `expirePendingBooking` individually (own transaction per booking, so one booking's failure can't roll back another's expiry).

**Never released:** capacity for a `confirmed` booking, under any code path added in this phase. **Never double-released:** enforced the same way Phase 3 already proved it (a conditional update that can only succeed once per booking).

## 10. Idempotency strategy

Two independent idempotency guarantees, both database-enforced (not in-memory checks), matching Phase 3's established pattern:
1. **Booking creation** — entirely unchanged from Phase 3 (`@@unique([workspaceId, idempotencyKey])`). A retried form submission still returns the original booking; if that booking is `pending` awaiting payment, the retry also returns its existing (or freshly-regenerated-if-expired) checkout URL rather than creating a second `Payment` row for the same attempt.
2. **Webhook events** — new, `@@unique` on `PaymentEvent.providerEventId`, enforced exactly as described in §8. Covers both Stripe's documented at-least-once delivery guarantee and the case where two conceptually-overlapping event types (`checkout.session.completed` and `payment_intent.succeeded`) both arrive for the same successful payment — each has a distinct `event.id` and is processed once, but the second one's booking transition is *itself* idempotent (`transitionBookingStatus`'s existing `alreadyInStatus` short-circuit), so no error, no double audit log, no double capacity effect either way.

## 11. Security plan

- Webhook signature verified with the raw body before any parsing or DB access; a bad signature never reaches application logic.
- Every amount sent to Stripe is read from the `Booking`/`Payment` row inside the server, never from a client-supplied field — the public booking request schema (Phase 3, unchanged) already has no price field to strip in the first place.
- `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` never returned in any API response; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is public by Stripe's own design (safe to ship to the client) but is unused in this phase since Checkout is fully server-redirect-driven — no client-side Stripe.js is loaded.
- Public serializers expose `checkoutUrl`/payment `status`/`receiptUrl` (Stripe's own receipt links are guest-facing by design) but never `providerPaymentIntentId`/`providerCheckoutSessionId`/`failureCode`/raw event payloads — those stay behind `canViewBookingPII` on the internal side.
- Every Payment/PaymentEvent DB lookup used to serve a response is scoped by `workspaceId` (for internal routes, from the verified membership; for the public retry/lookup routes, from the booking resolved by its own tenant-scoped/high-entropy identifier) — a payment can't be looked up cross-tenant.
- Confirmation page (`/book/confirmation/[publicToken]`) keeps its existing `noindex,nofollow`.
- The webhook route itself performs no tenant check by user/session (impossible — Stripe isn't a logged-in tenant user) — its trust boundary is entirely the signature; every DB write it makes is scoped by the `workspaceId` already stored on the `Payment`/`Booking` rows it looks up, so a valid webhook for tenant A's payment can never touch tenant B's data.
- Request body size and content-type are validated on every new route the same way Phase 3's public booking route already does.

## 12. Testing plan

**Unit** (no DB): payment-status → UI-label mapping, `toStripeAmount()` zero-decimal-currency handling, the webhook idempotency-violation-detection helper (mirrors the existing `isIdempotencyKeyViolation` pattern), the public/internal payment serializers' field redaction.

**Integration** (real Postgres, mirrors Phase 3's fixture style): a public booking for a paid tour lands `pending` with a `requires_payment` `Payment` row; a simulated `checkout.session.completed`/`payment_intent.succeeded` webhook (built with `stripe.webhooks.generateTestHeaderString`, posted to the real route handler) confirms the booking and marks the payment succeeded, atomically; redelivering the identical event is a no-op (one `PaymentEvent`, one audit entry, booking still confirmed, no error); a `payment_intent.payment_failed` webhook marks the payment failed but leaves the booking `pending` and capacity still held; `expirePendingBooking` on a booking whose payment window has passed cancels it and releases capacity exactly once, and is proven **not** to touch a booking a concurrent webhook confirms in the same instant (the core race from §9); a payment/booking pair from workspace A is rejected (404, zero data) when looked up through workspace B's internal API or an unrelated public token; dashboard payment fields are redacted for `viewer` exactly like guest PII already is. Every existing Phase 3 integration test that asserted a public booking lands `confirmed` on creation is updated to assert `pending` (for the seeded paid-tour fixture) — the underlying atomic-reservation, idempotency, and cross-tenant-rejection guarantees those tests exist to prove are otherwise unchanged and re-verified as-is.

**E2E**: extend the existing Playwright critical-flow spec (or add a parallel one) to cover the guest journey through to a *simulated* payment success (this sandbox has no real Stripe test-mode credentials to drive an actual hosted Checkout page, so the e2e test drives the same webhook-fixture approach as the integration suite against the running production server, then asserts the confirmation page and dashboard both show `succeeded`/`confirmed`) — documented as a known gap versus a true end-to-end browser trip through Stripe's own hosted page, which requires real Stripe test-mode API keys this environment does not have.

## 13. Risks and rollback notes

- **Risk:** a workspace that has never configured `STRIPE_SECRET_KEY` still has tours with `basePrice > 0`. A guest booking one would hit a Stripe call that fails. **Mitigation:** the checkout-session-creation function fails closed with a clear 503-class error caught by `handleApiError`, and the booking's atomic reservation has already either fully committed or fully rolled back by the time that call happens — a guest never ends up with a seat silently held forever with no way to pay for it in this failure mode, since the *reservation* transaction is separate from and precedes the *Stripe API call* (the reservation is authoritative and safe on its own; only the follow-on payment-session step can fail, and if it does, the booking simply stays `pending` and is eventually swept by the same expiration mechanism used for a guest who abandons checkout).
- **Risk:** clock skew between this server and Stripe's `expires_at` handling on the Checkout Session itself. **Mitigation:** our own `Payment.expiresAt` (and the expiration sweep) is the authoritative source of truth for capacity release, not Stripe's session expiry — even if Stripe's hosted page stays technically reachable a few seconds past our own window, a completed payment after our sweep has already cancelled the booking simply cannot re-confirm it (the sweep's conditional update and the webhook's conditional update are symmetric: whichever transaction commits first on `status = 'pending'` wins, the other finds zero matching rows and no-ops).
- **Rollback:** the new `Payment`/`PaymentEvent` tables and the `Booking.payments` back-relation are purely additive — reverting the status-resolution change in `lib/bookings/service.ts` (one conditional) alone is sufficient to restore exact Phase 3 behavior (all public bookings auto-confirm) without touching the schema, if Stripe needs to be disabled in an emergency; the webhook route and payment routes simply go unused (no traffic reaches them) rather than needing to be deleted.
- **Known limitation accepted for this phase:** the expiration sweep requires an operator (or an external scheduler once deployed) to trigger `POST /api/admin/payments/expire-pending`; there is no in-process cron in this Next.js application. Documented in the completion report as a Phase 5+ deployment task, not a code gap.
