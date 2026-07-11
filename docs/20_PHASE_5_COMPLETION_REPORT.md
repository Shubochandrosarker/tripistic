# Tripistic — Phase 5 Completion Report (CRM & Communication)

## 1. Executive status

Phase 5 is **complete and verified**. Unlike Phases 3 and 4, this phase
arrived with no detailed master prompt — only "Phase 5 (CRM &
communication) is the recommended next step." Scope was derived from the
project's own pre-existing specifications
(`docs/02_MVP_FEATURE_SPEC.md` §5, `docs/07_COMPLIANCE_SECURITY_SPEC.md`
§1/§3, `docs/03_DATABASE_AND_DATA_MODEL.md`'s already-reserved
`customers`/`messages` table shapes) and written up as
`docs/19_PHASE_5_IMPLEMENTATION_PLAN.md` before any code was touched,
mirroring the rigor of the master-prompt-driven Phase 3/4 plans.

Every booking (public or manual) now upserts a deduplicated `Customer`
profile; a real SMTP-based email layer sends a tracked booking
confirmation from all three places a booking can become `confirmed`; a
T-24h departure reminder sweep and a consent-gated review-request
foundation are both live; a working one-click unsubscribe flow enforces a
genuine transactional/marketing split; and the two-year-old "stubbed
until Phase 5" invitation-email TODO is closed. All Phase 1–4 functionality
is preserved with zero regressions (§10).

Full review-collection UI, SMS/WhatsApp channels, GDPR self-service
data-subject-request workflows, and per-workspace retention settings were
**not** started, per the plan's explicit scope boundary. See §12.

## 2. What shipped

1. **Customer CRM** — a `Customer` row is created or updated, deduped by
   `(workspaceId, lowercased email)`, inside the same transaction as every
   booking creation (public or manual) — the profile and the booking that
   references it always commit atomically together. A repeat booking
   refreshes `name`/`phone` from the latest submission but never overwrites
   operator-entered `notes`/`tags`/`consentStatus`. Dedup is workspace-scoped
   — the same email in two different workspaces is two distinct customers.
2. **Email infrastructure** (`lib/messaging/mailer.ts`) — a lazily
   constructed `nodemailer` SMTP transport, following the identical
   "optional integration, app boots and works unconfigured" convention
   Phase 4 established for the Stripe client. Every send attempt is
   recorded as a `Message` row (`queued` → `sent`/`failed`/`skipped`) —
   never a fire-and-forget side effect with no record, and never allowed
   to throw into the caller that triggered it.
3. **Automated booking confirmation email** — sent from all three places a
   booking can become `confirmed` (§5).
4. **T-24h departure reminder sweep** — `POST /api/admin/messages/sweep`
   (`platform_admin`-gated, mirrors `POST /api/admin/payments/expire-pending`
   exactly), emails every confirmed booking whose departure is within the
   next 24 hours and has no existing sent reminder. No in-process
   scheduler exists in this application — same documented gap as Phase 4's
   expiration sweep.
5. **Review-request foundation** — sent the moment a booking transitions to
   `completed`. Deliberately a foundation only: the outbound trigger,
   template, and send-tracking ship; a public review-collection/star-rating
   page does not (§12).
6. **Real transactional/marketing split** — booking confirmation and the
   T-24h reminder are transactional and are **never** gated by consent
   (CAN-SPAM/GDPR both treat relationship messages as opt-in-exempt). The
   review request is the one marketing-flavored send this phase
   introduces: skipped — and recorded as `status: "skipped"`, never
   silently dropped — for a customer whose `consentStatus === "unsubscribed"`,
   and carries a real, working one-click unsubscribe link.
7. **Invitation emails** — `POST /api/workspaces/:id/invitations` now sends
   a real email through the same mailer; the invite link is still always
   returned in the response as a fallback, so an admin can share it
   directly if delivery fails or SMTP isn't configured.

## 3. Schema and migrations

One new migration, `20260711030000_phase5_crm_communication`, generated
via `prisma migrate diff` against the updated `schema.prisma` (this
sandbox cannot run `prisma migrate dev` interactively — same generation
method used for every prior phase's migration), applied with
`prisma migrate deploy`, verified against a completely empty database
with zero drift (§10). No existing table, column, or migration was
modified.

- **Four new enums**: `ConsentStatus` (`subscribed`/`unsubscribed`/`unknown`,
  defaulting to `unknown` — a guest who books has not affirmatively
  opted into marketing, so defaulting to `subscribed` would overstate
  consent under GDPR's opt-in standard), `MessageChannel` (`email` only —
  structured to add SMS/WhatsApp later without a concept-level schema
  change), `MessageStatus` (`queued`/`sent`/`failed`/`skipped`),
  `MessageTemplateKey` (`booking_confirmation`/`booking_reminder`/
  `review_request`/`member_invitation`).
- **`customers`** table: `workspace_id`, `name`, `email`, `phone`,
  `country`, `tags` (`String[]`), `consent_status`, `notes`, timestamps,
  `deleted_at`. `@@unique([workspaceId, email])` is the dedup constraint;
  `@@unique([workspaceId, id])` exists to support the composite FK from
  `Booking` below; `@@index([workspaceId, consentStatus])` for the
  consent-gate lookup.
- **`bookings.customer_id`** (new, nullable column) — a composite
  `(workspaceId, customerId)` foreign key against `customers(workspaceId,
  id)`, the same tenant-safe pattern the whole booking subtree already
  uses (`Booking.tour`, `Booking.availability`). **`onDelete: Restrict`**,
  not `SetNull`: Prisma's own schema formatter rejects `SetNull` on a
  composite FK when one of its columns (`workspaceId`) is required — a
  `SetNull` here would have to null out a `NOT NULL` column, which
  Postgres cannot do. This matches the exact precedent already set by
  `Booking.tour`/`Booking.availability`: a referenced row can never be
  hard-deleted while a booking points to it; soft-delete
  (`Customer.deletedAt`) is the only erasure path, consistent with every
  other table in this app that carries business history.
- **`messages`** table: `workspace_id`, nullable `booking_id`/`customer_id`
  (unscoped by a composite FK, unlike `Booking`↔`Customer` — a message can
  legitimately have no booking or no customer, and this table is an
  observability/audit log first, matching `AuditLog`'s existing
  nullable-FK precedent), `channel`, `template_key`, `status`, `to_email`,
  `subject`, `provider_message_id`, `error_message`, `sent_at`,
  timestamps. `booking_id`/`customer_id` are `onDelete: SetNull` (safe
  here since neither is part of a composite/required-column FK).
  Indexes: `(workspaceId, bookingId)`, and
  `(workspaceId, templateKey, bookingId)` — the exact index the reminder
  sweep's and every send-site's "has this already been sent?" dedupe
  check relies on.

## 4. Routes and pages added or changed

**Internal**:
- `GET /api/workspaces/[id]/customers` (new) — paginated, searchable
  (name/email/phone) list with a `consentStatus` filter;
  `canViewCustomers`-gated (owner/admin/staff/viewer).
- `GET/PATCH /api/workspaces/[id]/customers/[customerId]` (new) — profile
  detail (booking history, message send log) and edit
  (name/phone/country/tags/notes/consentStatus — **never** `email`, the
  immutable dedup key); `PATCH` is `canManageCustomers`-gated
  (owner/admin/staff), `GET` follows the same `canViewCustomers` tier as
  the list route. `PII` (email/phone/notes/message log) is redacted for
  `viewer`, reusing the existing `canViewBookingPII` gate rather than a
  new parallel one — a customer's contact fields are exactly as sensitive
  as a booking's guest contact fields already gated by that function.
- `POST /api/workspaces/[id]/invitations` (changed) — now attempts a real
  email send after creating the invitation; best-effort, never blocks the
  response.

**Admin**:
- `POST /api/admin/messages/sweep` (new) — `platform_admin`-gated, runs
  the T-24h reminder sweep across all workspaces, returns
  `{ scanned, sent }`.

**Public**:
- `GET /unsubscribe/[token]` (new page, not a JSON route) — verifies an
  HMAC-signed token, flips `consentStatus` to `unsubscribed`, renders a
  simple confirmation. `noindex,nofollow`.

**Dashboard**:
- `/dashboard/customers` (rewritten from the Phase-5 placeholder) —
  search, consent-status filter, paginated table.
- `/dashboard/customers/[customerId]` (new) — profile, editable
  notes/tags/consent (via `CustomerEditPanel`, manage-capable roles only),
  booking history, message log.

Production build confirms all of the above compile and route correctly
alongside every pre-existing route — **75 routes total**, zero
regressions (§10).

## 5. Where the confirmation email is triggered from

Three distinct code paths can move a booking into `confirmed`, and all
three send exactly one confirmation email — proven directly in
`tests/integration/messaging.test.ts`, not just by code inspection:

1. **`createBooking()`** (`lib/bookings/service.ts`) — a free public
   booking, or a manual booking explicitly created as `confirmed`, lands
   `confirmed` at creation time with no separate transition step. The
   send fires only on the genuine creation branch, never on an idempotent
   replay (proven by a dedicated test asserting exactly one `Message` row
   survives two identical submissions).
2. **`transitionBookingStatus()`** (`lib/bookings/status-service.ts`) — an
   operator manually confirms a `pending` manual booking from the
   dashboard. The same function's `toStatus === "completed"` branch is
   also where the review request (§2.5) is triggered — a booking can only
   reach `completed` through this one path today.
3. **`processStripeWebhookEvent()`** (`lib/payments/webhook-service.ts`) —
   the main paid-booking path from Phase 4; the webhook's transition uses
   `transitionBookingStatusInTx` (composable, transaction-scoped), not
   `transitionBookingStatus`, so path 2's hook point does not cover it —
   the webhook service calls `sendBookingConfirmationEmail` itself, after
   its own transaction commits.

All three call the same shared `sendBookingConfirmationEmail(bookingId)`
in `lib/messaging/service.ts`, **after** each path's own commit —
mirroring exactly where `recordAuditEvent` already fires post-commit in
each of these three places — and it is designed to never throw into the
caller: a messaging failure must not be allowed to undo or fail a
successful booking/payment/status change, the identical principle already
applied to audit logging in every prior phase.

## 6. Reminder and review-request design

`lib/messaging/reminders.ts`, mirroring `lib/payments/expiration.ts`'s
exact shape:

- `findDueReminderBookingIds(now)` — every `Booking` with
  `status: "confirmed"`, `departureStartsAt` between `now` and `now+24h`,
  with no existing `Message` row for `templateKey: "booking_reminder"` and
  `status: "sent"`. Using "within the next 24 hours" rather than a narrow
  T-24h-exactly window makes correctness independent of how often the
  sweep actually runs — the "no existing sent reminder" check, not the
  time window, is what prevents a duplicate; verified directly by running
  the sweep twice in a row against the same due booking and confirming
  only one `Message` row exists afterward.
- `sendDueReminders()` — sends to every due id via
  `sendBookingReminderEmail`, then **re-queries** the actual `sent` count
  from the `messages` table rather than assuming every attempt succeeded
  (`sendBookingReminderEmail` never throws or reports its own outcome —
  see §2.2), so the reported `{ scanned, sent }` count is accurate even
  when some sends fail.
- The review request has no sweep of its own — it has no "time window" to
  catch on a delay the way a pre-departure reminder does, so it is
  triggered inline at the moment of the `completed` transition (§5),
  never re-scanned for.
- Exposed via `POST /api/admin/messages/sweep`, `platform_admin`-gated.
  Same known gap as Phase 4: there is no in-process scheduler anywhere in
  this Next.js application; wiring a recurring trigger (Vercel Cron, a
  hosting platform's scheduled job) to call this endpoint is a
  deployment-time task, not built in this phase.

## 7. Unsubscribe mechanism and consent enforcement

`lib/messaging/unsubscribe-token.ts` generates a self-contained token —
`base64url(customerId).base64url(HMAC-SHA256("unsubscribe:" + customerId, AUTH_SECRET))`
— requiring no separate token table or expiry, unlike time-limited
invitation tokens, since an unsubscribe request should always be
honorable, indefinitely. Verification uses `timingSafeEqual` and rejects
a tampered signature, a forged customer id reusing another token's
signature, or a token signed under a different secret (all proven in
`tests/unit/unsubscribe-token.test.ts`, 6 tests).

`GET /unsubscribe/[token]` is a public **page**, deliberately mutating on
GET rather than requiring a confirm-then-POST step (contrast
`/invite/[token]`, which requires an explicit accept click): one-click,
no-confirmation unsubscribe is the CAN-SPAM/GDPR-recommended pattern, and
the action is idempotent — safe against an email-security scanner
prefetching the link, or a guest opening it twice (both proven directly:
`applyUnsubscribeToken` returns a distinct `already_unsubscribed` result
on a second call rather than erroring or writing again). The DB-mutating
logic was deliberately extracted into `applyUnsubscribeToken()` in
`lib/messaging/service.ts` rather than left inline in the page component,
since this codebase has no established pattern for directly testing
rendered Server Component output — the extracted function is a plain,
directly testable async function; the page itself is a thin
presentational wrapper.

Consent enforcement is proven end-to-end in
`tests/integration/messaging.test.ts`: a review request sends to a
customer with the default `unknown` status and to one who explicitly
`subscribed`; it is skipped — with a `status: "skipped"` `Message` row,
not silence — for one who is `unsubscribed`, and no mailer call is made
for that skipped send.

## 8. Dashboard updates

- **`/dashboard/customers`** — rewritten from the Phase-5 placeholder:
  search box (name/email/phone), consent-status filter, paginated table
  (Name, Contact, Bookings, Tags, Consent), respecting the same PII
  redaction the API enforces.
- **`/dashboard/customers/[customerId]`** — profile detail with booking
  history and message send-log `SectionCard`s (PII-gated), and an
  editable profile panel (`CustomerEditPanel`) for manage-capable roles —
  name, phone, country, tags (comma-separated input), consent status,
  notes.
- **Members/invitations settings panel** — copy corrected from "invite
  email arrives/ships in Phase 5" framing to "created and emailed"
  framing, now that it's true.
- **Onboarding checklist** — the "Phase 5–7: guest communication,
  waivers, guide manifests, and the AI Growth Dashboard" bullet was
  replaced with a "CRM & communication — live now" bullet and a narrowed
  "Phase 6–7" bullet for what's still ahead.
- **Customers nav item** — the `"Phase 5"` badge was removed now that the
  section is live.

## 9. Security and compliance notes

- No email transport credentials (`SMTP_USER`/`SMTP_PASS`) are ever
  logged or returned in any API response; `Message.errorMessage` stores
  an operator-facing failure reason, never a raw provider/library error
  object or stack trace.
- The unsubscribe token is unforgeable without `AUTH_SECRET`, using a
  domain-separation prefix (`"unsubscribe:"`) so the same secret's use
  for NextAuth session signing can't be leveraged to forge one from the
  other.
- Every `Customer`/`Message` lookup that serves a response is scoped by
  the `workspaceId` already verified on the caller's membership — proven
  directly in `tests/integration/customer-crm.test.ts`: a customer
  created under workspace A returns `404` with zero data when looked up
  through workspace B's routes.
- `email` is immutable after a customer's creation via the API (the
  dedup key) — `updateCustomerSchema` has no `email` field at all, not
  merely a field that's rejected at runtime.
- Guest email addresses are HTML-escaped in every template
  (`lib/messaging/templates.ts`'s `escapeHtml`) before interpolation —
  proven directly in `tests/unit/messaging-templates.test.ts` with a
  `<script>` payload in a guest-controlled field.
- Transactional templates (confirmation, reminder) never include an
  unsubscribe link; only the one marketing-flavored template (review
  request) does — proven directly by asserting `/unsubscribe/` is absent
  from the other two templates' rendered HTML.
- `dependencies`/`devDependencies` security: see §11.

## 10. Tests added

| Suite | File | Count |
|---|---|---|
| Unit | `tests/unit/unsubscribe-token.test.ts` | 6 |
| Unit | `tests/unit/messaging-templates.test.ts` | 6 |
| Integration | `tests/integration/customer-crm.test.ts` | 7 |
| Integration | `tests/integration/messaging.test.ts` | 12 |
| Integration | `tests/integration/messaging-reminders.test.ts` | 8 |

- **`unsubscribe-token`**: generate/verify round-trip, distinct tokens per
  customer id, rejection of a tampered signature, a forged id reusing a
  stolen signature, garbage input, and a token signed under a different
  secret.
- **`messaging-templates`**: each template's subject/body includes the
  expected reference/link/framing; HTML-escaping of guest-controlled
  fields; graceful omission of optional location/meeting-point lines;
  the review-request-only unsubscribe link.
- **`customer-crm`**: a repeat booking from the same (mixed-case) email in
  the same workspace updates the existing customer rather than
  duplicating it and refreshes the name; the same email in a different
  workspace is a distinct customer (dedup is workspace-scoped); operator-set
  notes/tags/consent survive a repeat booking untouched; role enforcement
  (`viewer` list redaction, `viewer`-403/owner-200 edit) and cross-tenant
  404 isolation on the customer routes; unauthenticated 401.
- **`messaging`**: a confirmation email sends exactly once from each of
  the three trigger paths in §5 (free public booking, manual
  booking-created-confirmed, manual pending→confirmed transition, and a
  Stripe-webhook-confirmed paid booking), each verified against a real
  tracked `Message` row with `status: "sent"` and a `providerMessageId`;
  an idempotent replay does not send a second email; a mocked SMTP
  failure is tracked as `status: "failed"` without throwing into the
  caller; review-request consent gating (§7); a booking transitioning to
  `completed` triggers the review request automatically; a member
  invitation email is tracked as sent, and the invitation route still
  returns a usable `inviteUrl` even when the mocked mailer throws.
- **`messaging-reminders`**: a confirmed booking departing within 24
  hours and not yet reminded is found and sent to; one departing further
  out, one still `pending`, and one already reminded are all correctly
  excluded; running the sweep twice against the same due booking does not
  send a duplicate; a mocked SMTP failure during the sweep is tracked as
  `status: "failed"` without throwing.

**Every existing Phase 1–4 test still passes unmodified** — Phase 5 added
one new required-at-the-type-level field (`Booking.customerId`) but no
existing test needed behavioral changes; the one required fixture update
was `tests/unit/booking-serializers.test.ts`'s hand-built `fakeBooking()`
helper gaining `customerId: null` to satisfy the type.

Commands: `npm run test:unit`, `npm run test:integration`, `npm run
test:e2e`, `npm run test:ci`.

## 11. Dependency and security notes

- **`nodemailer`** added at `9.0.3` (exact-pinned), **not** the version
  first installed (`7.0.9`). `npm audit` flagged `nodemailer<=9.0.0`
  across 5 findings (4 moderate + 1 high) covering 7 distinct GHSA
  advisories: recursive-call DoS, SMTP command injection via
  `envelope.size`, CRLF injection via `EHLO`/`HELO` and via `List-*`
  headers, `jsonTransport` bypass of file/URL access controls, improper
  TLS certificate validation during OAuth2 token fetch, and a `raw`-option
  bypass enabling arbitrary file read/SSRF. `9.0.3` (confirmed via `npm
  view nodemailer dist-tags` as the actual current latest — `npm audit`'s
  own suggested "fix to 7.0.13" would **not** have resolved any of these)
  restored `npm audit` to the pre-existing 4-moderate baseline.
- **`next-auth@5.0.0-beta.31`** declares a `peerOptional` dependency on
  `nodemailer@^7.0.7` for its unused Email/magic-link provider (this app
  is Credentials-only). Upgrading nodemailer to `9.0.3` on its own
  produces a real `ERESOLVE` failure under `npm ci` (verified directly by
  running `rm -rf node_modules && npm ci` and checking the actual exit
  code, not just `npm install`'s more lenient behavior) — this would have
  broken CI. Fixed precisely, not broadly: `package.json` gained
  `"overrides": { "next-auth": { "nodemailer": "9.0.3" } }`, forcing
  next-auth's internal resolution to the patched version, rather than
  reaching for the blunter `--legacy-peer-deps` (which would silence
  *every* future peer conflict, not just this one). Re-verified with a
  second clean `rm -rf node_modules && npm ci` (exit 0) and `npm ls
  nodemailer` (9.0.3 everywhere, `overridden` annotation present, no
  vulnerable nested copy).
- **`@types/nodemailer`** stayed at `7.0.2` rather than bumping to match —
  the same peer-conflict pattern reappeared for the types package, and
  the type declarations for `createTransport`/`sendMail` are stable
  across the versions involved, so pinning the (dev-only, non-shipping)
  types package slightly behind was judged a low-risk, pragmatic
  simplification rather than another `overrides` entry.
- `npm audit` at the end of this phase: **4 moderate findings**, the same
  pre-existing `next`/`postcss` transitive chain flagged since Phase 2.1
  — no new advisory from anything added this phase.

## 12. Verification results

Run against the sandbox's Postgres 16 instance, migrations applied fresh:

```
$ npm run lint            → clean, no errors or warnings
$ npm run typecheck       → clean, no errors
$ npm run test:unit       → 9 files, 74 tests passed (62 existing + 12 new)
$ npm run test:integration → 6 migrations applied (no pending/no drift),
                             14 files, 100 tests passed (73 existing + 27 new)
$ npm run test:e2e        → 1/1 passed, against a real production build
                             with SMTP left unconfigured (see below)
$ npm run build           → succeeded, 75 routes, zero conflicts
$ npm audit                → 4 moderate findings (pre-existing next/postcss
                             chain — no new advisory; see §11)
```

**Fresh-database verification** (this session, separate from the
`tripistic_test` integration run): a brand-new database was created,
`prisma migrate deploy` applied all 6 migrations cleanly from empty,
`prisma format --check` and a `prisma migrate diff` against that live
database both confirmed **zero drift** between `schema.prisma` and the
applied migrations, and the temporary database was dropped afterward.

**Graceful-degradation proof against a real production server, not just
a mock**: the Playwright critical-flow spec runs against a genuinely
built (`npm run build`) production server with no `SMTP_HOST` configured
in its environment — the exact state this sandbox has always been in.
The e2e booking flow passed, and a direct database query afterward
confirmed the booking's confirmation-email attempt was genuinely made and
genuinely failed closed:

```
template_key         | status | error_message
booking_confirmation | failed | SMTP_HOST is not configured — email delivery is unavailable until it is set.
```

This is the same proof pattern used throughout this phase's design: a
messaging failure is always tracked, never silent, and never allowed to
break the operation that triggered it — verified here against a real
process, not only inferred from code inspection or a mocked test.

## 13. Known gaps

- **No in-process scheduler.** `POST /api/admin/messages/sweep` exists
  and is fully tested, but nothing calls it on an interval — identical
  gap and identical reasoning to Phase 4's expiration sweep: wiring a
  real cron/scheduled trigger is a deployment-time task for whichever
  platform this ships to, not application code.
- **No rich HTML email templates.** Every template is a small function
  producing plain, readable HTML with a text fallback — matching this
  codebase's "no heavy abstraction beyond what's needed" style. No
  MJML/React-Email dependency was added for four templates.
- **`receipt_url`-style provider metadata is minimal.** `Message` records
  `providerMessageId` from `nodemailer`'s response but does not attempt
  delivery/open/click tracking — SMTP has no such concept without a
  dedicated ESP API, which is out of scope (`docs/19` explicitly commits
  to SMTP-only transport this phase).
- **No per-workspace retention settings.** `docs/07`'s "retention
  settings" line is a reasonable future addition to the existing
  `Setting` model but was not required by this phase's acceptance
  criteria and was not built.
- **Consent has no self-service opt-*in* UI.** A guest can unsubscribe
  (flip to `unsubscribed`) via the one-click link, but there is no public
  flow for a guest to explicitly opt **into** marketing beyond the
  default `unknown` state — `docs/02`'s AC only requires "consent
  respected" (i.e., opt-out is honored), not a full preference center.

## 14. What was explicitly NOT built (Phase 6+)

Per `docs/19`'s explicit scope boundary (§3), none of the following were
implemented, stubbed, or partially scaffolded: a public review-collection
page (star ratings, testimonial submission, aggregate rating display —
this phase ships only the outbound trigger/template/tracking, not
collection); SMS or WhatsApp messaging channels; a GDPR self-service
data-subject-request workflow (export/erasure UI — the existing
`Customer.deletedAt` soft-delete plus operator-assisted DB access remains
the only erasure path, same posture as every other table in this app);
per-workspace message retention-period settings; digital waiver signing;
the AI Growth Dashboard or an AI booking assistant; OTA sync; SaaS
subscription billing for Tripistic's own tenants; white-label custom
domain billing.

## 15. Recommended Phase 6

The roadmap (`docs/08`) and this phase's own boundaries point to two
roughly-equal-sized candidates: **digital waivers** (a genuinely new
capability — participant e-signature capture and storage, referenced by
`docs/02` as a distinct Phase 6 line item and not touched by anything
built so far) or **closing the review-request foundation into a full
review-collection flow** (the public-facing counterpart to the outbound
trigger this phase already ships — a star-rating/testimonial submission
page addressed by the `confirmationUrl`-style token pattern this phase's
`buildUnsubscribeUrl`/`buildBookingConfirmationUrl` already established,
plus aggregate rating display on the public tour page). Waivers is the
more clearly-scoped, self-contained next slice with the least dependency
on product decisions not yet made (a review UI needs a decision on
public display/moderation policy that this phase deliberately did not
make); it is the recommended starting point.
