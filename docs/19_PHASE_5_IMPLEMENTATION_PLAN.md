# Tripistic — Phase 5 Implementation Plan (CRM & Communication)

> Written before Phase 5 coding. Unlike Phases 3 and 4, this phase was not handed a detailed master prompt — only "Phase 5 (CRM & communication) is the recommended next step." The scoping below is therefore derived directly from the project's own pre-existing specs (`docs/02_MVP_FEATURE_SPEC.md` §5, `docs/07_COMPLIANCE_SECURITY_SPEC.md` §1/§3, `docs/03_DATABASE_AND_DATA_MODEL.md`'s already-designed `customers`/`messages` table shapes) plus the recommendation this session made at the end of Phase 4. Every scoping decision is documented explicitly, per this engagement's standing instruction to make reasonable decisions and record them rather than pause for confirmation.

## 1. Source-of-truth requirements (verbatim from existing docs)

- `docs/02` §5: "Customer profiles (dedup by email per workspace), history, notes/tags, consent status; email templates; automated confirmation + T-24h reminder; review request foundation. **AC: booking creates/updates customer; confirmation email sends; consent respected.**"
- `docs/07` §1: Phase 5 compliance scope is "Messaging consent, opt-out, transactional/marketing separation."
- `docs/07` §3: "Lawful basis + consent tracking on customer records (`consent_status` from Phase 5)"; "marketing opt-in/out."
- `docs/03` already reserves the exact shapes: `customers (workspace_id, name, email, phone, country, tags[], consent_status, notes, timestamps, deleted_at; unique (workspace_id, email))` and `messages (workspace_id, booking_id?, customer_id?, channel, template_key, status, sent_at)`.
- `.env.example` already reserves `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` — the transport was always intended to be SMTP-based, not a provider-specific HTTP API.
- Two pre-existing "stubbed until Phase 5" call-outs found during the repo audit, both now in scope: `app/api/workspaces/[id]/invitations/route.ts` ("Email delivery is stubbed until Phase 5 — the invite link is returned") and the matching UI copy in `components/settings/members-panel.tsx`.

## 2. What ships this phase

1. **Customer model** — auto-created/updated (deduped by `(workspaceId, email)`) every time a booking is made, public or manual. Operators can additionally edit name/phone/country/tags/notes/consent from a real dashboard CRM view (`/dashboard/customers`, currently a Phase-5 placeholder).
2. **Email infrastructure** — a lazy SMTP client (`nodemailer`), following the exact "optional integration, app still works unconfigured" convention Phase 4 established for Stripe. Every send is tracked as a `Message` row (queued → sent/failed), never a fire-and-forget side effect with no record.
3. **Automated booking confirmation email** — sent the moment a booking becomes `confirmed`, from all three places that can produce that transition (see §5).
4. **T-24h departure reminder** — an admin-triggered sweep (mirroring Phase 4's expiration sweep — this application still has no in-process scheduler) that emails every confirmed booking whose departure is within the next 24 hours and hasn't already been reminded.
5. **Review-request foundation** — sent once a booking transitions to `completed`. "Foundation" is taken literally: this ships the outbound trigger, template, and send-tracking, **not** a public review-collection/star-rating page — that is a materially larger, separate feature and is explicitly out of scope (§10).
6. **Consent enforcement with a real transactional/marketing split** — confirmation and reminder emails are transactional (the guest booked a specific service and needs this information regardless of marketing preference; CAN-SPAM and GDPR both treat "relationship/transactional" messages as exempt from opt-in requirements) and are **never** gated by consent. The review request is the one marketing-flavored send this phase introduces, and **is** gated: skipped (logged as `Message.status = "skipped"`, not silently dropped) for any customer whose `consentStatus === "unsubscribed"`. A real, working one-click unsubscribe link is included on every marketing-flavored send.
7. **Invitation emails** — the two-year-old "stubbed until Phase 5" TODO is closed: `POST /api/workspaces/:id/invitations` now sends a real email through the same mailer, with the invite link kept in the API response and UI as a fallback (an admin can still copy/share it directly if email delivery fails or SMTP isn't configured).

## 3. Explicitly out of scope this phase

Full review collection (public star-rating/testimonial submission page, aggregate rating display) — "foundation" only, per §2.6. SMS/WhatsApp channels — `docs/02`'s Phase 5 line item says "email templates" only; the `Message.channel` enum is still deliberately structured to add channels later without a schema change to the concept. A full GDPR data-subject-request workflow (self-service export/erasure) — `docs/07`'s "export + deletion workflows" line is listed under general GDPR scope, not tied to a specific phase's AC, and is a materially separate feature; this phase's `Customer.deletedAt` soft-delete plus the ability to hard-delete/anonymize via the existing DB access remains the operator-assisted path for now, same posture as every other Phase 1–4 table. Per-workspace retention-period settings (`docs/07`'s "retention settings... settings store is ready") — reasonable future addition to the existing `Setting` model, not required by the Phase 5 AC. A rich HTML email template system — plain, readable emails (simple HTML with a text fallable) generated by small template functions, matching this codebase's existing "no heavy abstraction beyond what's needed" style; no MJML/React-Email dependency added for three templates.

## 4. Schema changes

Two new enums beyond `ConsentStatus`/`MessageStatus`/`MessageTemplateKey`, two new models, one additive column on `Booking`. New migration `..._phase5_crm_communication`, generated the same way as every prior phase's migration in this sandbox (`prisma migrate diff --from-migrations ... --to-schema-datamodel ... --shadow-database-url ... --script`, since `prisma migrate dev` cannot run non-interactively here). No existing table, column, or migration touched.

```prisma
enum ConsentStatus { subscribed unsubscribed unknown }
enum MessageChannel { email }
enum MessageStatus { queued sent failed skipped }
enum MessageTemplateKey { booking_confirmation booking_reminder review_request member_invitation }
```

`ConsentStatus` defaults to `unknown` on customer creation — a guest who books a tour has not affirmatively opted into marketing (only into receiving the transactional messages about their own booking), so defaulting to `subscribed` would overstate consent under GDPR's opt-in standard. `unknown` and `subscribed` are both eligible for the one marketing-flavored send this phase has (review request); only `unsubscribed` blocks it — this keeps the send eligible for the common real-world case (a workspace that never builds a marketing opt-in UI still gets review requests) while making unsubscribe fully effective the moment a guest uses it.

```prisma
model Customer {
  id            String        @id @default(cuid())
  workspaceId   String        @map("workspace_id")
  name          String
  email         String
  phone         String?
  country       String?
  tags          String[]      @default([])
  consentStatus ConsentStatus @default(unknown) @map("consent_status")
  notes         String?
  createdAt / updatedAt / deletedAt

  workspace Workspace @relation(...)
  bookings  Booking[]
  messages  Message[]

  @@unique([workspaceId, email])
  @@map("customers")
}
```

`Booking` gains `customerId String? @map("customer_id")` with a composite `(workspaceId, customerId)` foreign key against `customers(workspaceId, id)` — the same tenant-safe pattern the whole booking subtree already uses — `onDelete: Restrict`, identical to `Booking.tour`/`Booking.availability`: a `Customer` can never be hard-deleted while a booking references it (Prisma itself rejects `SetNull` here at schema-format time, since it would require nulling the required `workspace_id` column too). Soft-delete (`Customer.deletedAt` + clearing PII fields in place) remains the only erasure/anonymization path, consistent with every other table in this app that carries business history.

```prisma
model Message {
  id                String             @id @default(cuid())
  workspaceId       String             @map("workspace_id")
  bookingId         String?            @map("booking_id")
  customerId        String?            @map("customer_id")
  channel           MessageChannel     @default(email)
  templateKey       MessageTemplateKey @map("template_key")
  status            MessageStatus      @default(queued)
  toEmail           String?            @map("to_email")
  subject           String?
  providerMessageId String?            @map("provider_message_id")
  errorMessage      String?            @map("error_message")
  sentAt            DateTime?          @map("sent_at")
  createdAt / updatedAt

  @@index([workspaceId, bookingId])
  @@index([workspaceId, templateKey, bookingId])   // "has this booking already been reminded?"
  @@map("messages")
}
```

`toEmail`/`subject`/`providerMessageId`/`errorMessage` extend `docs/03`'s minimum shape the same way Phase 4's `Payment` table extended its own literal minimum field list — needed for a real send-tracking system (a snapshot of who it actually went to, what it said, and why it failed if it did), not scope creep. `bookingId`/`customerId` are both nullable and unscoped by a composite FK (unlike `Booking`↔`Customer`) — a message can legitimately have no booking (a future non-booking-triggered send) or no customer (a manual-booking guest who somehow has no email on file), and this table is an observability/audit log first, a strict relational record second, matching `AuditLog`'s existing nullable-FK precedent in this exact codebase.

## 5. Where the confirmation email is triggered from

Three distinct code paths can move a booking into `confirmed`, and all three must send exactly one confirmation email — no more, no fewer:

1. **`createBooking()`** (`lib/bookings/service.ts`) — a free public booking, or a manual booking explicitly created as `confirmed`, lands `confirmed` at creation time with no separate transition step.
2. **`transitionBookingStatus()`** (`lib/bookings/status-service.ts`) — an operator manually confirms a `pending` manual booking from the dashboard.
3. **`processStripeWebhookEvent()`** (`lib/payments/webhook-service.ts`) — the main paid-booking path from Phase 4; the webhook's transition uses `transitionBookingStatusInTx`, not `transitionBookingStatus`, so path 2's hook point does not cover it automatically.

A single shared function, `sendBookingConfirmationEmail(bookingId)` in `lib/messaging/service.ts`, is called from all three, **after** each path's own commit (mirroring exactly how `recordAuditEvent` is already called post-commit in every one of these three places) — never inside the transaction, and never allowed to throw into the caller (a failed send must not undo or fail a successful booking/payment/status change, the identical principle already applied to audit logging). The review request follows the same shape, hooked only into `transitionBookingStatus`'s `toStatus === "completed"` branch (a booking can only be marked `completed` through that one path today).

## 6. Reminder and review-request sweeps

`lib/messaging/reminders.ts`, mirroring `lib/payments/expiration.ts`'s exact shape:

- `findDueReminders()` — every `Booking` with `status: "confirmed"`, `departureStartsAt` between now and now+24h, that has no existing `Message` row with `templateKey: "booking_reminder"` and `status: "sent"`. Using "within the next 24 hours" (not a narrow T-24h-exactly window) makes the sweep's own run cadence irrelevant to correctness — as long as it runs more than once before a given departure, nothing is missed or double-sent (the "no existing sent reminder" check is the actual dedupe guard, not the time window).
- `findDueReviewRequests()` — every `Booking` with `status: "completed"` is instead handled inline at the moment of transition (§5), not by a sweep — a review request has no "time window" concept the way a pre-departure reminder does, so there is nothing to catch on a delay; it is included in the same sweep endpoint below only for symmetry/observability (`sendDueReminders()` and the inline completed-transition hook are both exposed through one endpoint's response shape), not because it re-scans for it.
- `POST /api/admin/messages/sweep` (new, `platform_admin`-gated, mirrors `/api/admin/payments/expire-pending` exactly) — runs the reminder sweep across all workspaces and returns a count. Same known gap as Phase 4: no in-process scheduler exists in this Next.js application; wiring a recurring trigger is a deployment-time task.

## 7. Unsubscribe mechanism

A one-click, no-login unsubscribe link is required on every marketing-flavored send by CAN-SPAM/GDPR. `lib/messaging/unsubscribe-token.ts`: `generateUnsubscribeToken(customerId)` produces `base64url(customerId).base64url(HMAC-SHA256(customerId, AUTH_SECRET))` — self-contained (no separate token table/expiry needed, unlike invitation tokens, since an unsubscribe request should always be honorable, indefinitely) and unforgeable for a different customer id without knowing `AUTH_SECRET`. `GET /unsubscribe/[token]` is a public **page** (not a JSON API route, matching how `/book/confirmation/[publicToken]` is a page, not an endpoint) that verifies the token, flips `consentStatus` to `unsubscribed` (idempotent — visiting twice is harmless), and renders a simple confirmation. `noindex,nofollow`, same as every other token-addressed public page in this app.

## 8. Permissions

New capability functions in `lib/auth/permissions.ts`, following the exact existing per-capability pattern: `canManageCustomers(role)` → owner/admin/staff (matches `canManageBookings` exactly — the same roles that operate bookings day-to-day are the ones who talk to guests and edit their records); `canViewCustomers(role)` → adds `viewer`. No new PII-tier function is needed — a customer record's `email`/`phone`/`notes` are exactly as sensitive as a booking's guest contact fields already gated by `canViewBookingPII`, so the dashboard customer detail page reuses that existing function rather than inventing a parallel one.

## 9. Routes and pages

**Internal**: `GET /api/workspaces/[id]/customers` (list/search/paginate), `GET/PATCH /api/workspaces/[id]/customers/[customerId]` (profile detail + edit name/phone/country/tags/notes/consentStatus — never email, which is the dedup key and immutable after creation, matching how a booking's departure/price are immutable after creation).

**Admin**: `POST /api/admin/messages/sweep` (new, see §6).

**Public**: `GET /unsubscribe/[token]` (new page, see §7).

**Changed**: `POST /api/workspaces/[id]/invitations` now attempts a real email send (best-effort, never blocks the response — the invitation is created and the link returned regardless of whether the email succeeds).

**Dashboard**: `/dashboard/customers` (rewritten from the Phase 5 placeholder — list with search, tag/consent filters), `/dashboard/customers/[customerId]` (new — profile, editable notes/tags/consent, booking history, message send log).

## 10. Testing plan

**Unit**: template rendering (each of the four templates produces the expected subject/body given fixture data, including the unsubscribe link appearing only on the review-request template); the unsubscribe token's generate/verify round-trip and its rejection of a tampered/foreign token; the consent-gating predicate as a pure function.

**Integration**: a public and a manual booking each upsert/dedupe a `Customer` row by `(workspaceId, lowercased email)`, updating name/phone on a repeat booking rather than creating a duplicate; a confirmation email (tracked `Message` row, `status: "sent"`) is sent exactly once from each of the three trigger paths in §5 (Stripe client and mailer both mocked, matching Phase 4's testing approach — this sandbox has no real SMTP credentials); the reminder sweep sends to a due, not-yet-reminded confirmed booking and is a correct no-op for one outside the 24h window or already reminded; a review request is sent for a `subscribed`/`unknown` customer and is skipped (with a `status: "skipped"` `Message` row, not silence) for an `unsubscribed` one; the unsubscribe page flips consent and is safe to hit twice; a customer record from workspace A is unreachable through workspace B's routes; `viewer` can see a customer but not `canManageCustomers`-gated edit actions; an invitation POST attempts a send and still returns the invite link when the mailer isn't configured (this sandbox's default state).

**E2E**: the existing Playwright critical-flow spec's free-tour booking will now also trigger a confirmation-email attempt against an unconfigured SMTP transport in the production server process — this must fail closed (logged, not thrown) exactly like every other optional-integration failure mode in this app, or the whole booking flow would break; verified explicitly as part of this phase's e2e re-run, not assumed.

## 11. Security and compliance notes

No email transport credentials are ever logged or returned in any API response. The unsubscribe token is unforgeable without `AUTH_SECRET` but requires no secondary lookup table, matching invitation tokens' security bar with less state. Every `Customer`/`Message` lookup that serves a response is scoped by the `workspaceId` already verified on the caller's membership, identical to every other tenant table in this app. `Message.errorMessage` stores an operator-facing failure reason, never a raw provider/library error object.
