# Tripistic — Phase 3 Implementation Plan (Booking Engine MVP)

> Written before Phase 3 coding, per `TRIPISTIC_PHASE_3_MASTER_PROMPT.md` §3. Assumes `docs/13_PHASE_2_1_HARDENING_PLAN.md` has landed first (transaction-safe schedules, canonical archive, strict date/timezone/query validation, capacity constraints, test/CI foundation).

## 1. Goal

Ship the full unpaid direct-booking flow end to end: **public workspace page → public tour page → departure selection → guest/participant/add-on form → server-priced booking → atomic seat reservation → confirmation screen → operator dashboard → manual booking → status management/cancellation release.** Gate: a real public or manual booking reserves seats atomically with zero overbooking under concurrency, is visible in the correct workspace, and one cancellation releases seats exactly once.

## 2. Current-state findings relevant to Phase 3

- `Availability.bookedCount` exists and is always `0` (Phase 2 reserved it, never written to).
- No `Booking`/`Customer`/`Payment` models exist in `prisma/schema.prisma` (confirmed via full model scan).
- No booking capability functions exist in `lib/auth/permissions.ts`.
- No unauthenticated/slug-based tenancy resolution path exists — `getActiveWorkspace`/`requireWorkspaceAccess` both require a verified `userId`. A new public resolution helper is required.
- `/dashboard/bookings` is a static Phase-3-placeholder empty state; nav carries a "Phase 3" badge; `lib/onboarding.ts` has two items gated behind `phase: "Phase 3"`/manual `done: false`.
- `middleware.ts` matcher only covers `/dashboard`, `/admin`, `/workspaces`, `/invite`, `/login`, `/register` — new `/book/**` and `/embed/**` routes are **not** in the matcher, so they are public by default (correct — no change to middleware needed, confirmed no accidental auth-gating).
- Existing API route shape (`try → requireUserApi → requireWorkspaceAccess → capability check → zod.parse → prisma op → recordAuditEvent → json()` / `catch → handleApiError`) is reused for every new internal route; public routes use the same outer `try/catch → handleApiError` shape but substitute slug resolution for the auth+membership steps.

## 3. Schema changes

Two new enums, four new models, additive relation fields on `Workspace`/`Tour`/`Availability`/`TourAddon`/`User`. New migration `..._phase3_booking_engine`. No existing column is renamed, dropped, or retyped — Phase 1/2 tables are untouched except for additive relation back-references and the two `@@unique([workspaceId, id])` additions described below (both are pure additions, non-breaking).

```
enum BookingStatus { pending confirmed cancelled completed no_show }
enum BookingSource { public_direct manual }
```

**Tenant-integrity design** (ties into hardening plan §3.8): `Tour` and `Availability` each get `@@unique([workspaceId, id])`. `Booking.tour` and `Booking.availability` are declared as **composite** relations — `@relation(fields: [workspaceId, tourId], references: [workspaceId, id])` — instead of plain single-column FKs. This makes "a booking referencing a tour/availability from a different workspace" a Postgres constraint violation, not just an application bug: the database itself is a second line of defense behind the canonical service's explicit tenant-scoped fetches. `onDelete: Restrict` on both (a `Tour`/`Availability` can never be hard-deleted while bookings reference it — soft-delete/archive remains the only path, which is already how Tour deletion works).

`Booking` itself gets `@@unique([workspaceId, id])` so its three child tables (`BookingParticipant`, `BookingAddonSelection`, `BookingStatusEvent`) can use the same composite-FK pattern against it (`onDelete: Cascade` — these are pure children with no independent lifecycle; cascading only matters in the still-forbidden hard-delete path, so it is inert in normal operation and simply prevents orphans if that path is ever used for GDPR erasure in a later phase). `BookingAddonSelection.tourAddon` stays a plain nullable single-column FK (`onDelete: SetNull`) — add-ons are optional and can be deleted independently; the snapshot fields (`nameSnapshot`, `unitPrice`, `totalPrice`) are the source of truth after creation, the relation is only for convenience traceability while it lasts.

```
model Booking {
  id                        String        @id @default(cuid())
  workspaceId                String        @map("workspace_id")
  tourId                     String        @map("tour_id")
  availabilityId              String        @map("availability_id")
  reference                   String        // human-friendly, random, unique per workspace
  publicToken                 String        @unique @map("public_token") // high-entropy, global
  idempotencyKey               String?       @map("idempotency_key")
  source                       BookingSource @default(public_direct)
  status                       BookingStatus @default(pending)
  guestFirstName                String
  guestLastName                 String
  guestEmail                    String        // normalized lowercase
  guestPhone                    String?
  guestNotes                    String?
  operatorNotes                 String?       // internal only, never in public serializer
  participantCount               Int
  tourTitleSnapshot               String
  locationSnapshot                String?
  meetingPointSnapshot            String?
  departureStartsAt                DateTime      @db.Timestamptz(6)
  departureEndsAt                  DateTime      @db.Timestamptz(6)
  unitPrice                        Int           // cents
  subtotal                         Int
  addonsTotal                      Int
  totalAmount                      Int
  currency                         String
  cancellationPolicySnapshot       String?
  termsAcceptedAt                  DateTime      @db.Timestamptz(6)
  confirmedAt / cancelledAt / completedAt   DateTime? @db.Timestamptz(6)
  createdById                      String?       // manual bookings only
  createdAt / updatedAt

  @@unique([workspaceId, reference])
  @@unique([workspaceId, idempotencyKey])   // Postgres treats multiple NULLs as distinct — correct "nullable unique" semantics
  @@unique([workspaceId, id])
  @@index([workspaceId, status, createdAt])
  @@index([availabilityId, status])
  @@index([workspaceId, guestEmail])
  @@index([workspaceId, tourId])
}

model BookingParticipant {
  id, workspaceId, bookingId, firstName, lastName, email?, phone?, notes?, isLead, timestamps
  @@index([workspaceId, bookingId])
}

model BookingAddonSelection {
  id, workspaceId, bookingId, tourAddonId?, nameSnapshot, unitPrice, quantity, totalPrice, timestamps
  @@index([workspaceId, bookingId])
  @@index([tourAddonId])
}

model BookingStatusEvent {
  id, workspaceId, bookingId, fromStatus?, toStatus, actorUserId?, note?, createdAt
  @@index([workspaceId, bookingId, createdAt])
}
```

Seed data: one small, clearly-labeled development booking scenario appended to `prisma/seed.ts` (a confirmed public-direct booking against a seeded future availability, gated the same way the platform-admin seed is — only when an explicit `SEED_DEMO_BOOKING=true` env flag is set, defaulting off — so `db:seed` in CI/production never fabricates booking metrics; documented as dev-only in the completion report).

## 4. Route and page map

**Public API** (`/api/public/**`, no auth, `Cache-Control: no-store`):
```
GET  /api/public/[workspaceSlug]/tours
GET  /api/public/[workspaceSlug]/tours/[tourSlug]
GET  /api/public/[workspaceSlug]/tours/[tourSlug]/availability?from&to&partySize
POST /api/public/[workspaceSlug]/bookings
GET  /api/public/bookings/[publicToken]
```

**Internal API** (`/api/workspaces/[id]/bookings/**`, same auth/tenancy pattern as tours):
```
GET  /api/workspaces/[id]/bookings                       (list, filters, pagination)
POST /api/workspaces/[id]/bookings                        (manual booking)
GET  /api/workspaces/[id]/bookings/[bookingId]
PATCH /api/workspaces/[id]/bookings/[bookingId]            (limited non-financial edit)
POST /api/workspaces/[id]/bookings/[bookingId]/status       (state-machine transition)
```

**Public pages**:
```
/book/[workspaceSlug]
/book/[workspaceSlug]/[tourSlug]
/book/confirmation/[publicToken]
/embed/[workspaceSlug]/[tourSlug]
```
All four live outside `app/dashboard` (own minimal layout, no `AppShell`), so `middleware.ts`'s matcher — unchanged — never intercepts them.

**Dashboard pages** (inside existing `AppShell`, replacing the placeholder):
```
/dashboard/bookings
/dashboard/bookings/new
/dashboard/bookings/[bookingId]
```

## 5. Permission decisions

New capability functions in `lib/auth/permissions.ts`, following the existing per-capability (non-hierarchical) pattern:

- `canManageBookings(role)` → `workspace_owner | workspace_admin | staff` (full operate: manual create, edit, status transitions, cancellation) — matches `docs/05`'s matrix ("staff: operate") and the existing `ROLE_DESCRIPTIONS.staff` copy ("Handles bookings and guest support (from Phase 3)").
- `canViewBookings(role)` → adds `viewer` on top of the above (read-only).
- `canViewBookingPII(role)` → `workspace_owner | workspace_admin | staff` — **excludes viewer**. Viewer-facing list/detail responses redact `guestEmail`/`guestPhone`/participant `email`/`phone`/`notes` and `operatorNotes` (masked, e.g. `j***@example.com`, or omitted entirely for notes — decided: omitted, since a partial mask of free-text notes isn't meaningful).
- `guide` gets no new capability — falls through to "no access" for the booking list/detail routes and pages (403/hidden nav), consistent with `docs/05` explicitly scoping guide manifest access to Phase 6.

Enforced in: API routes (server-side, authoritative), server pages (page-level guard mirrors the API check so a viewer never even receives the "New booking" affordance), and the service layer itself (`createBooking`'s manual path re-checks `canManageBookings` independent of the caller — defense in depth, not just "hide the button").

## 6. Booking status state machine

`lib/bookings/status.ts` — single source of truth for allowed transitions:

```
pending   → confirmed | cancelled
confirmed → cancelled | completed | no_show
cancelled → (terminal)
completed → (terminal)
no_show   → (terminal)
```

- `pending` and `confirmed` both count as "holds a seat." `cancelled` releases a seat exactly once (guarded by a conditional update on `status IN ('pending','confirmed')`, same technique as capacity reservation — see §7). `completed`/`no_show` do not touch capacity.
- Public unpaid direct bookings default to `status: confirmed` (no payment gate exists yet, so there is nothing to keep it "pending" for — documented decision, matches master prompt §16 "default to confirmed unless the implementation plan documents a genuine operator-confirmation setting"; no such setting is built in Phase 3).
- Manual bookings default to `confirmed`, with an explicit `status: "pending"` opt-in exposed in the manual-booking form for operators who want a soft hold.
- Every transition writes one `BookingStatusEvent` row and one `recordAuditEvent` call (after commit, never inside the transaction, matching the existing codebase convention and master-prompt §26 "audit failure must not corrupt a successful booking transaction").
- Invalid transitions (including any attempt to move off a terminal status) return `409` from the status endpoint and are rejected by the service layer even if an API bug ever bypassed the route-level check.

## 7. Atomic reservation design (the load-bearing decision)

One canonical function, `createBooking(input, actor)`, in `lib/bookings/service.ts`. Both `POST /api/public/[workspaceSlug]/bookings` and `POST /api/workspaces/[id]/bookings` build a `CreateBookingInput` + `BookingActor` and call it — no reservation logic is duplicated in either route handler.

Inside one `prisma.$transaction(async (tx) => { ... })`:

1. Re-resolve workspace (by id, `status: "active"`, `deletedAt: null`), tour (by id **and** `workspaceId`, `deletedAt: null`, `status: "active"`, and — public only — `visibility: "public"`), and availability (by id **and** `workspaceId` **and** `tourId`) inside the transaction, from the database, never from caller-trusted values.
2. Validate availability is `status: "scheduled"` and `startsAt > now()`.
3. Validate participant count/participants array and add-on selections (active, belong to the same tour/workspace, quantity within `maxPerBooking`) — all against freshly-read rows.
4. Compute price server-side only: `unitPrice = availability.priceOverride ?? tour.basePrice`; `subtotal = unitPrice × participantCount`; per-addon `totalPrice = addon.price × quantity`, summed into `addonsTotal`; `totalAmount = subtotal + addonsTotal`; `currency = tour.currency`. The request body's price/total/currency/status/workspaceId/reference/token/bookedCount fields (if present at all — the Zod schema doesn't even declare them) are never read.
5. **Atomic capacity reservation** — the forbidden read-then-write sequence (read `bookedCount`, check in application memory, unconditional later update) is never used. Instead, a single parameterized conditional `UPDATE ... WHERE ... RETURNING` runs through `tx.$queryRaw` (Prisma tagged-template, auto-parameterized — no string interpolation of values):
   ```sql
   UPDATE availabilities
   SET booked_count = booked_count + $seats, updated_at = now()
   WHERE id = $availabilityId
     AND workspace_id = $workspaceId
     AND tour_id = $tourId
     AND status = 'scheduled'
     AND starts_at > now()
     AND booked_count + $seats <= capacity
   RETURNING id, booked_count;
   ```
   Postgres takes the row lock at `UPDATE` time, so two concurrent transactions racing for the last seats **serialize** on this row: the first to reach `UPDATE` holds the lock until commit/rollback; the second blocks, then re-evaluates the `WHERE` clause (including `booked_count + $seats <= capacity`) against the now-updated row once unblocked. If zero rows come back, the transaction throws a typed `BookingCapacityError`, the transaction rolls back (no partial writes), and the route returns `409` with the exact guest-facing message from the master prompt. This is the "parameterized conditional update" strategy the master prompt explicitly names as acceptable, and it is proven (not just asserted) by the concurrency integration test in §10.
6. Generate `reference` (8-char random human-friendly code, custom alphabet excluding ambiguous characters) and `publicToken` (`crypto.randomBytes(24).toString("base64url")`, ~144 bits). Insert `Booking`, `BookingParticipant[]` (participant row 1 = lead guest when the client doesn't submit a separate lead-only row — documented as the MVP rule from master prompt §15), `BookingAddonSelection[]` snapshot rows, and the initial `BookingStatusEvent` (`fromStatus: null → toStatus: booking.status`), all inside the same transaction.
7. Commit. `recordAuditEvent("booking_created"` or `"booking_created_manual"`, safe metadata only — reference, tourId, availabilityId, participantCount, source) fires after commit succeeds.
8. If the `reference`/`publicToken` unique constraint is hit (astronomically unlikely, still handled), the whole attempt retries up to 5 times with freshly generated values; idempotency-key collisions (§8) are handled separately and never retried as if they were a random collision.

### Explicitly forbidden and not present anywhere in this design

Reading `bookedCount` into application memory and later issuing an unconditional `UPDATE`/`create` — the entire reservation is one guarded `UPDATE ... WHERE ... RETURNING`, full stop.

## 8. Idempotency

- Public booking form generates `idempotencyKey: crypto.randomUUID()` once per booking attempt (stored in component state, not regenerated on retry) and sends it in the request body; validated as `z.string().uuid()`.
- Before opening the transaction, the route checks `prisma.booking.findFirst({ where: { workspaceId, idempotencyKey } })` — a genuine retry (network blip, double-click despite UI disabling) short-circuits to returning the existing booking's confirmation payload with `201` semantics unchanged for the caller (same response shape; the client cannot distinguish a first success from an idempotent replay, by design).
- The remaining race — two concurrent requests with the same key both passing the pre-check — is closed by the `@@unique([workspaceId, idempotencyKey])` DB constraint: the losing transaction's `Booking` insert throws `P2002`, the transaction (including its capacity increment) rolls back entirely, and the route catches that specific constraint violation, re-queries the now-committed winner, and returns it. Net effect: **exactly one** capacity reservation per idempotency key, proven by a concurrent-duplicate-submission integration test.

## 9. Cancellation and seat release

`lib/bookings/service.ts::cancelBooking(bookingId, actor, { reason? })` — the one cancellation path used by both the internal status endpoint and (if ever exposed later) any self-service flow:

1. Load the booking tenant-scoped inside a transaction.
2. Conditional update: `UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $id AND workspace_id = $workspaceId AND status IN ('pending','confirmed') RETURNING id` — only the transaction that actually flips the row gets a returned row.
3. Only when a row was returned: release capacity with another guarded conditional update, `UPDATE availabilities SET booked_count = GREATEST(booked_count - $seats, 0) WHERE id = $availabilityId RETURNING booked_count` (the `GREATEST` floor is redundant defense — the guard in step 2 already guarantees single-release — but costs nothing and matches "never allow a negative count" literally).
4. Write the `BookingStatusEvent` + commit. Audit event after commit.
5. If step 2 returns zero rows (already cancelled/completed/no-show, or a concurrent cancel already won), the call is treated as **idempotent success** for a repeat-cancel of an already-cancelled booking (no error, no double release), and as a `409` conflict for any other non-cancellable current status (e.g. trying to cancel a `completed` booking) — the route layer distinguishes these two cases by re-reading the booking's current status after the no-op update.

## 10. Testing strategy

- **Unit** (`test:unit`, no DB): strict date/timezone validators (shared with hardening plan), booking reference/token generation shape, pricing math, add-on max-quantity validation, participant-count validation, the status-transition matrix (every allowed and rejected pair), public/viewer serializer redaction.
- **Integration** (`test:integration`, real Postgres via `tripistic_test`, transactions rolled back or truncated between tests): the full numbered list in master prompt §29, notably — two concurrent bookings racing for the last seat (assert exactly one succeeds, `bookedCount` never exceeds `capacity`), same idempotency key under concurrency (assert exactly one booking row, one capacity increment), concurrent duplicate cancellation (assert exactly one release), cross-tenant tour/availability/add-on injection into the booking service (assert rejection, zero side effects), forged price/total/currency/status/reference in the request body (assert server values win), DB CHECK constraints under raw SQL violation attempts.
- **Role/API**: unauthenticated → 401, outsider workspace → 404 with zero data, owner/admin/staff manage, viewer redacted read-only, guide blocked.
- **Playwright** (`test:e2e`, against a production build + seeded Postgres): the 9-step flow from master prompt §29, deterministic seed data (a public workspace with one active public tour and one seeded future availability).

## 11. Explicit out-of-scope (unchanged from master prompt, restated for the completion report)

No Stripe/payment intents/deposits/refunds. No real email/SMTP delivery — the confirmation page states this plainly. No Customer CRM module — guest data lives on the booking row only. No waiver signing flow (the `waiverRequired` flag is surfaced as a note, not collected). No guide assignment/manifest UI. No AI, OTA sync, custom domains, or SaaS billing. No rate-limiting infrastructure (documented recommendation for Cloudflare/WAF instead, per master prompt §27).

## 12. Migration strategy

Single new forward migration `..._phase3_booking_engine` generated via `prisma migrate dev` against the live sandbox Postgres instance (not hand-written blind), reviewed before commit. No edits to the two existing Phase 1/2 migrations. Fresh-database verification (`migrate deploy` → `db:seed` → build → smoke flow) is run against a completely empty database as the final gate, per master prompt §30.
