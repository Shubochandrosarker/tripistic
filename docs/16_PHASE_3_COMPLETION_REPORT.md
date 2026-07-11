# Tripistic — Phase 3 Completion Report (Booking Engine MVP)

## 1. Executive status

Phase 3 is **complete and verified**. The booking engine described in
`docs/14_PHASE_3_IMPLEMENTATION_PLAN.md` is implemented end-to-end: public
tour discovery and booking pages, real-time availability, guest checkout,
server-side pricing, atomic PostgreSQL-level seat reservation, idempotent
booking creation, exactly-once cancellation with capacity release, manual
(operator) bookings through the same canonical service, a full dashboard
bookings module, and an embed/iframe foundation with a share panel on the
tour detail page.

The mandatory **Phase 2.1 hardening gate** (`docs/13_PHASE_2_1_HARDENING_PLAN.md`,
report in `docs/15_PHASE_2_1_HARDENING_REPORT.md`) was completed and verified
*before* any Phase 3 code that exposes booking to the public was written, per
the master prompt's required order. All Phase 1 and Phase 2 functionality is
preserved — no architecture rewrite, no replacement project. Booking capacity
is never read-then-written; every seat reservation and every seat release is
a single conditional `UPDATE` at the database level, proven correct under
real concurrent load (see §7).

Phase 4 (Stripe payments, CRM, email delivery, waivers, AI, OTA sync, SaaS
billing) was **not started**, per explicit instruction. See §16.

## 2. Functionality shipped

- **Public workspace and tour discovery** — `/book/[workspaceSlug]` lists a
  workspace's publicly bookable tours; `/book/[workspaceSlug]/[tourSlug]`
  shows tour details, cancellation policy, and upcoming departures with live
  seats-remaining counts.
- **Guest booking flow** — party size, per-guest first/last name, optional
  add-ons with quantities, contact email/phone, terms acceptance, honeypot
  spam field. Pricing (base price × party size + add-ons) is computed
  **only** on the server from the current DB state — the client never sends
  a price.
- **Atomic seat reservation** — a single parameterized `UPDATE` reserves
  seats or fails with a clear conflict, never a read-then-write race.
- **Idempotent public booking creation** — a client-generated UUID
  idempotency key lets a retried submission (double-click, network retry)
  return the original booking instead of creating a duplicate or double-
  reserving seats.
- **Booking confirmation page** — `/book/confirmation/[publicToken]`,
  `noindex,nofollow`, shows the booking reference, itinerary, and status
  without exposing other guests' data or internal IDs.
- **Cancellation with exactly-once seat release** — from both the operator
  dashboard and (data-model level) a public token lookup; capacity is
  restored via a conditional `UPDATE`, never double-released under
  concurrent cancel attempts.
- **Manual/operator bookings** — `/dashboard/bookings/new`, using the
  identical `createBooking()` service as the public path (no parallel code
  path, no parallel bugs).
- **Dashboard bookings module** — list with search/status/date-range
  filters and summary counts, detail page with participant/add-on/status-
  history views, status-transition actions gated by role and the booking
  status state machine.
- **Embed/iframe foundation** — `/embed/[workspaceSlug]/[tourSlug]`, a
  frameable variant of the booking page (no site chrome), plus a share panel
  on the tour detail page that copies the public link and an iframe snippet.
- **Archive protection** — a tour or availability with active future
  bookings can no longer be archived, deleted, or shrunk below its booked
  count (Phase 2.1 invariants extended in Phase 3, see §12).

## 3. Phase 2.1 hardening — completed before Phase 3 exposure

Full detail in `docs/15_PHASE_2_1_HARDENING_REPORT.md` (gate verdict:
**✅ approved**). Summary of what it closed, because Phase 3 depends on it:

- Strict calendar-date and IANA-timezone validation (`lib/validation.ts`),
  closing a silent-corruption path where an invalid timezone previously
  produced zero schedule slots instead of an error.
- Transaction-safe schedule creation (`lib/tours/schedule.ts`,
  `generateSlotsForSchedule` now takes an explicit `Db` client so it can run
  inside the same transaction as the schedule row it generates from).
- A canonical `archiveTour()` service (`lib/tours/archive.ts`) replacing
  ad-hoc status writes, later extended in Phase 3 to block archiving a tour
  with active future bookings.
- Database-level capacity invariants: `capacity > 0`,
  `booked_count >= 0`, `booked_count <= capacity` as Postgres `CHECK`
  constraints, not just application checks.
- Composite tenant-scoped foreign keys (`@@unique([workspaceId, id])` +
  `@relation(fields: [workspaceId, ...])`) adopted as the pattern for the
  new Booking subtree, so a cross-tenant row reference is rejected by the
  database itself, not only by application-layer scoping.
- A test/CI foundation (Vitest unit + Postgres-backed integration, GitHub
  Actions) that Phase 3's own test suite builds on directly.
- Dependency pinning and a `next-auth` bump to close its own advisory.

## 4. Schema and migrations

Two new migrations, both applied and verified against a fresh database
(§13):

- `20260710193000_availability_capacity_constraints` — hand-written SQL
  (Prisma's schema DSL cannot express `CHECK` constraints): `capacity > 0`,
  `booked_count >= 0`, `booked_count <= capacity` on `availabilities`.
- `20260710200000_phase3_booking_engine` — generated via
  `prisma migrate diff` against the updated `schema.prisma`, hand-placed
  into a migration folder, applied with `prisma migrate deploy`. Adds:
  - `BookingStatus` enum (`pending`, `confirmed`, `cancelled`, `completed`,
    `no_show`) and `BookingSource` enum (`public`, `manual`).
  - `Booking`, `BookingParticipant`, `BookingAddonSelection`,
    `BookingStatusEvent` tables, all `workspace_id`-scoped.
  - `@@unique([workspaceId, id])` added to `Tour` and `Availability` so
    `Booking.tour` / `Booking.availability` can use composite
    tenant-safe foreign keys (`ON DELETE RESTRICT`), rather than relying on
    application code alone to prevent cross-tenant references.
  - `@@unique([workspaceId, idempotencyKey])` on `Booking` (Postgres treats
    multiple `NULL`s as distinct, so manual bookings with no idempotency key
    are unaffected).
  - Foreign keys to `TourAddon` (`SET NULL` on delete, so removing an add-on
    later doesn't destroy booking history) and to `User` for
    `bookingsCreated` / `bookingStatusEvents` (`SET NULL`, an operator's
    departure doesn't destroy booking history).
  - Indexes supporting the dashboard list/filter/search query patterns
    (workspace + status, workspace + departure time, reference lookup).

Both migrations diff cleanly against `schema.prisma` — a fresh
`prisma migrate dev` run produces no drift.

## 5. Routes and pages added

**Public API** (`app/api/public/...`, no auth, workspace/tour resolved by
slug via `lib/tenancy/public.ts`):
- `GET /api/public/[workspaceSlug]/tours`
- `GET /api/public/[workspaceSlug]/tours/[tourSlug]`
- `GET /api/public/[workspaceSlug]/tours/[tourSlug]/availability`
- `POST /api/public/[workspaceSlug]/bookings` (honeypot field check,
  50 KB request-body cap)
- `GET /api/public/bookings/[publicToken]`

**Internal API** (`app/api/workspaces/[id]/bookings/...`, session-authed,
role-gated):
- `GET /api/workspaces/[id]/bookings` (list, pagination, filters, status
  summary), `POST` (manual create)
- `GET /api/workspaces/[id]/bookings/[bookingId]`, `PATCH` (limited fields)
- `POST /api/workspaces/[id]/bookings/[bookingId]/status` (state
  transition)

**Public pages**: `app/book/layout.tsx`, `app/book/[workspaceSlug]/page.tsx`,
`app/book/[workspaceSlug]/[tourSlug]/page.tsx`,
`app/book/confirmation/[publicToken]/page.tsx`.

**Embed**: `app/embed/layout.tsx`, `app/embed/[workspaceSlug]/[tourSlug]/page.tsx`.

**Dashboard**: `app/dashboard/bookings/page.tsx` (rewritten from the Phase 2
placeholder), `app/dashboard/bookings/new/page.tsx`,
`app/dashboard/bookings/[bookingId]/page.tsx`.

The production build (§14) confirms all of the above compile and route
correctly alongside every pre-existing Phase 1/2 route — 63 routes total,
zero regressions.

## 6. Components and services added

**Services** (`lib/bookings/`):
- `service.ts` — `createBooking()`, the single canonical reservation path
  used by both the public API and the manual-booking form. See §7–§8.
- `status-service.ts` — `transitionBookingStatus()` / `cancelBooking()`,
  the state-machine-enforced status change path. See §9.
- `status.ts` — the state machine table (`canTransition`,
  `isTerminalStatus`, `holdsCapacity`).
- `reference.ts` — `generateBookingReference()` (8-char human-friendly
  reference, unambiguous alphabet), `generatePublicToken()` (24 random
  bytes, base64url).
- `serializers.ts` — role- and audience-aware output shaping. See §10.
- `query.ts` — `buildBookingListQuery()`, shared by the internal API and the
  dashboard list page so filtering/pagination logic exists once.
- `page-data.ts` — `getTourBookingPageData()`, shared by the public booking
  page and the embed page.

**Supporting**: `lib/tenancy/public.ts` (`requirePublicWorkspace`,
`requirePublicTour` — 404 on any inactive/archived/soft-deleted/non-public
resource, indistinguishable from "doesn't exist"), `lib/tours/archive.ts`
(extended with the active-future-bookings guard), `lib/auth/permissions.ts`
(booking permission functions, §11), `lib/audit/audit-log.ts` (booking audit
actions).

**UI components**: `components/booking/tour-booking-form.tsx` (public guest
form), `components/tours/share-panel.tsx` (public link + iframe snippet,
copy-to-clipboard), `components/bookings/manual-booking-form.tsx` (operator
form, cascading tour → availability/add-on selection reusing the existing
internal APIs), `components/bookings/booking-status-actions.tsx` (status
transition buttons + cancel confirmation dialog), `components/ui/status-badge.tsx`
(extended with `confirmed`/`completed`/`no_show` tones).

## 7. Atomic reservation algorithm (the load-bearing decision)

Seat reservation is a **single parameterized UPDATE**, run inside a Prisma
interactive transaction, never a read-then-write:

```sql
UPDATE availabilities
SET booked_count = booked_count + $seats
WHERE id = $availabilityId
  AND workspace_id = $workspaceId
  AND booked_count + $seats <= capacity
RETURNING id
```

If it returns zero rows, the transaction throws a conflict error and rolls
back — no booking row, no partial state, regardless of *why* it failed
(sold out, tour archived mid-request, wrong tenant). Everything the request
needs to trust — workspace active, tour active and public, availability
belongs to that tour, availability still open — is re-verified **inside**
the same transaction against fresh reads, never trusting values the caller
supplied earlier in the request.

**Verified under real concurrency**
(`tests/integration/booking-concurrency.test.ts`): 12 simultaneous requests
racing for 3 remaining seats on the same availability — exactly 3 succeed,
9 receive a clean conflict response, and `booked_count` never exceeds
`capacity` at any point (checked via a raw query immediately after the
race). This is a real Postgres transaction race, not a mocked test.

## 8. Idempotency

The public create endpoint accepts a client-generated UUID
`idempotencyKey`. Enforcement is two-layered:
1. **Fast path** — before opening the reservation transaction, look up an
   existing booking with the same `(workspaceId, idempotencyKey)`; if found,
   return it unchanged (no new reservation attempt).
2. **Race fallback** — `@@unique([workspaceId, idempotencyKey])` at the
   database level catches the case where two identical requests both pass
   the fast-path check before either commits; the loser's `P2002` violation
   is caught, distinguished from a reference/token collision by which
   constraint fired, and resolved by re-fetching and returning the winner's
   booking instead of erroring.

Manual (operator) bookings pass no idempotency key — Postgres treats
multiple `NULL`s in a unique index as distinct, so this doesn't create
false collisions between manual bookings.

**Verified under concurrency**
(`tests/integration/booking-concurrency.test.ts`): 8 concurrent identical
requests (same idempotency key, same availability) produce exactly 1
booking row and exactly 1 seat reservation — not 8.

## 9. Cancellation and seat release

`transitionBookingStatus()` uses a conditional update for exactly-once
semantics:

```ts
tx.booking.updateMany({
  where: { id, workspaceId, status: existing.status }, // expected-status guard
  data: { status: toStatus, ... },
})
```

If `updateMany` reports 0 rows affected, another request already moved the
booking out of the expected status first — that request loses cleanly
instead of double-transitioning or double-releasing capacity. Only when
`toStatus === "cancelled"` (and only for a booking whose prior status held
capacity — `pending` or `confirmed`) does the same transaction also run:

```sql
UPDATE availabilities
SET booked_count = GREATEST(booked_count - $seats, 0)
WHERE id = $availabilityId AND workspace_id = $workspaceId
```

The state machine (`lib/bookings/status.ts`) is:
`pending → confirmed | cancelled`,
`confirmed → cancelled | completed | no_show`;
`cancelled`, `completed`, and `no_show` are terminal with no outgoing
transitions. An out-of-machine transition (e.g. `completed → cancelled`) is
rejected before the transaction opens.

**Verified under concurrency**
(`tests/integration/booking-concurrency.test.ts`): 5 concurrent duplicate
cancel requests against the same confirmed booking — exactly 1 succeeds,
the availability's `booked_count` drops by exactly the cancelled booking's
seat count (not 5×), and the other 4 receive a clean "already cancelled" or
conflict response rather than corrupting capacity.

## 10. Public data exposure rules

`lib/bookings/serializers.ts` enforces three distinct output shapes so an
internal type is never accidentally leaked to an untrusted audience:

- **`serializePublicBookingConfirmation`** (returned from the public create
  endpoint and the public token-lookup endpoint) — booking reference,
  status, tour/departure summary, participant *names* (needed for the
  confirmation the guest is looking at), pricing breakdown, and
  `publicToken` (the client already legitimately holds this — it's not a
  new disclosure, and it's required to reload `/book/confirmation/[publicToken]`).
  It explicitly excludes `guestEmail`, `guestPhone`, `operatorNotes`, and
  every internal database ID (`bookingId`, `workspaceId`, `tourId`,
  `availabilityId`) — only the opaque public token identifies the booking
  outside the tenant.
- **`serializeBookingListItem`** / **`serializeBookingDetail`** (internal
  dashboard/API only, session-authed) — full guest contact info and
  operator notes are included, but detail-level PII is further gated by
  `canViewBookingPII` (owner/admin/staff; workspace **viewers** see the
  booking but not guest contact details).
- Any workspace, tour, or availability that is inactive, archived, or
  soft-deleted resolves to a plain 404 on the public path
  (`requirePublicWorkspace`/`requirePublicTour`) — indistinguishable from a
  slug that never existed, so enumeration can't distinguish "wrong slug"
  from "exists but paused."

## 11. Permission matrix implemented

| Action | owner | admin | staff | viewer |
|---|---|---|---|---|
| View bookings list/detail | ✅ | ✅ | ✅ | ✅ |
| View guest contact info / operator notes | ✅ | ✅ | ✅ | ❌ |
| Create manual booking | ✅ | ✅ | ✅ | ❌ |
| Transition booking status (confirm/cancel/complete/no-show) | ✅ | ✅ | ✅ | ❌ |
| Archive a tour / shrink or delete an availability | ✅ | ✅ | ✅ | ❌ |

(`canViewBookings`, `canViewBookingPII`, `canManageBookings` in
`lib/auth/permissions.ts`; unchanged from the existing Phase 1/2 role model
— no new role was introduced.)

## 12. Phase 2 protection under Phase 3 load

Archiving a tour, deleting an availability, or shrinking an availability's
capacity below its `booked_count` are now rejected with a 409 whenever
active (`pending`/`confirmed`) future bookings exist —
`lib/tours/archive.ts` (`activeFutureBookings` count) and the availability
PATCH/DELETE routes. Verified in
`tests/integration/booking-protects-phase2.test.ts` and
`tests/integration/archive.test.ts`. Every pre-existing Phase 1/2 write path
(tour CRUD, schedule generation, member/invitation management, audit
logging) was re-run against the fresh-database verification in §13 with no
behavioral change other than these new guards.

## 13. Tests added

| Suite | File | Count |
|---|---|---|
| Unit | `tests/unit/validation.test.ts` | 23 |
| Unit | `tests/unit/booking-reference.test.ts` | 5 |
| Unit | `tests/unit/booking-status.test.ts` | 10 |
| Unit | `tests/unit/booking-serializers.test.ts` | 6 |
| Integration | `tests/integration/schedule-transaction.test.ts` | 3 |
| Integration | `tests/integration/capacity-constraints.test.ts` | 4 |
| Integration | `tests/integration/tenant-scoping.test.ts` | 4 |
| Integration | `tests/integration/archive.test.ts` | 4 |
| Integration | `tests/integration/booking-lifecycle.test.ts` | 13 |
| Integration | `tests/integration/booking-concurrency.test.ts` | 4 |
| Integration | `tests/integration/booking-protects-phase2.test.ts` | 6 |
| Integration | `tests/integration/booking-routes.test.ts` | 14 |
| E2E | `tests/e2e/booking-flow.spec.ts` | 1 (9-step critical public-booking journey) |

Exact totals from the run in §14: **44 unit tests** (4 files), **52
integration tests** (8 files, real Postgres, isolated fixtures per test),
**1 Playwright e2e spec**, all passing. `booking-routes.test.ts` mocks only
`requireUserApi` (session identity) and exercises the real HTTP route
handlers against a real database — not a mocked service layer.

Commands: `npm run test:unit`, `npm run test:integration`
(`scripts/test-integration.sh` — migrates `tripistic_test`, runs Vitest),
`npm run test:e2e` (`scripts/test-e2e.sh` — migrates, seeds the deterministic
`prisma/seed-e2e.ts` fixture, builds, runs Playwright against the production
server), `npm run test:ci` (full gate: generate → validate → lint →
typecheck → unit → integration → build). CI runs unit+integration and e2e as
two separate GitHub Actions jobs (`.github/workflows/ci.yml`), each with its
own Postgres 16 service container.

## 14. Fresh-database verification (this session)

Run against the sandbox's existing Postgres 16 instance, with both
migrations applied from empty:

```
$ npm run lint            → clean, no errors or warnings
$ npm run typecheck       → clean, no errors
$ npm run test:unit       → 4 files, 44 tests passed
$ npm run test:integration → 4 migrations applied (no pending/no drift),
                             8 files, 52 tests passed
$ npm run build           → succeeded, 63 routes (static + dynamic),
                             middleware 87.1 kB, no route conflicts
$ npm audit                → 4 moderate findings (see §15)
```

Playwright e2e (`npm run test:e2e`) was verified earlier in this session
across 5 consecutive clean runs against the same fresh-migration database,
covering the full public-booking → dashboard → cancellation → seat-restore
journey end-to-end against a production build. It was not re-run in this
final pass since nothing touching the booking flow changed after that
verification; the unit/integration/build/lint/typecheck re-run above is a
full re-verification of everything that could have drifted since.

## 15. Dependency and security audit

`npm audit`: **4 moderate findings**, all the same pre-documented transitive
chain from Phase 2.1 hardening (`docs/15_PHASE_2_1_HARDENING_REPORT.md`):
`postcss < 8.5.10` (XSS in CSS stringify output,
GHSA-qx2v-qp2m-jg93) pulled in transitively by `next`, which is in turn
pulled in by `geist` and `next-auth`. The only fix path `npm audit`
proposes is `next@9.3.3` via `--force`, a *major downgrade* that is not a
real fix — resolving this properly means the unrelated, larger project of
bumping to Next 16, which is out of scope for Phase 3. `next-auth`'s own
direct advisory (closed by the `5.0.0-beta.29 → 5.0.0-beta.31` bump in
Phase 2.1) remains fixed. No new dependency introduced in Phase 3
(`vitest`, `@playwright/test`, `dotenv`, `bcryptjs` types, etc. — all
devDependencies except runtime deps already present) added any new
advisory.

## 16. What was explicitly NOT built (Phase 4+)

Per the master prompt's explicit stop condition, none of the following were
implemented, stubbed, or partially scaffolded:
- Stripe or any payment processing (bookings are created as `pending`/
  `confirmed` with a computed price, but no payment is captured, authorized,
  or recorded against any processor)
- Email or SMS delivery (no confirmation emails, no reminders, no
  cancellation notices — the confirmation page is the only "receipt")
- CRM / guest profile features beyond the minimal contact fields stored on
  the booking itself
- Waivers / liability document collection
- AI features of any kind
- OTA (Viator/GetYourGuide/etc.) sync or channel management
- SaaS billing / subscription plan enforcement for Tripistic's own tenants

## 17. Recommended Phase 4 starting point

The booking engine's data model and canonical service already carry the
fields a payment integration needs (`totalPrice`, `currency`, booking
status separate from payment status), so the natural first Phase 4 slice is
**Stripe Payment Intents wired to the existing `pending → confirmed`
transition** — create the booking as today, create a Payment Intent in the
same request, and move `pending → confirmed` only on a verified webhook
rather than manually. That keeps the atomic-reservation and idempotency
guarantees built in Phase 3 completely intact and gives the next phase a
concrete, narrow first milestone rather than a re-architecture.
