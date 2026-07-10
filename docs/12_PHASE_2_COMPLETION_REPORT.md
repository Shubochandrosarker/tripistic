# Tripistic — Phase 2 Completion Report (Tour + Availability System)

**Status: ✅ Complete.** Built on the merged Phase 1 foundation; typechecked, linted, production-built, migrated + seeded on a fresh PostgreSQL 16, and verified end-to-end (36 smoke checks incl. timezone-correct slot generation, blackout skipping, idempotent regeneration, tenant isolation, and role guards). **Phase 2 stops here — no booking engine, payments, or AI were built.**

## 1. What was completed

| Deliverable | Status |
|---|---|
| `docs/11_PHASE_2_IMPLEMENTATION_PLAN.md` written before coding | ✅ |
| Tour/activity/package CRUD (kind, duration, capacity, pricing, visibility, policy, media placeholder) | ✅ |
| Add-ons per tour (price, max per booking, active toggle) | ✅ |
| Recurring schedules (days-of-week + start time + date range + capacity/duration overrides, pause/resume) | ✅ |
| **Slot generation engine** — materializes departures in the workspace timezone (DST-correct via `@date-fns/tz`), skips blackout dates, future-only, idempotent (DB-unique + skipDuplicates) | ✅ |
| Concrete departures: auto-generated + one-off, per-slot price override, cancel (row retained) | ✅ |
| Blackout dates (workspace-wide or tour-specific) | ✅ |
| Tours UI: real list page, creation page, full management page (details/schedules/departures/add-ons/blackouts) | ✅ |
| Dashboard integration: live "Upcoming departures" metric; onboarding items "Add your first tour" and "Set your availability" now track real state | ✅ |
| Permissions: `canManageTours` (owner/admin manage; guide/staff/viewer read-only); tenant isolation on every route | ✅ |
| 9 new audit actions wired end-to-end | ✅ |

## 2. Changed files

**New:** `lib/tours/{schedule,service}.ts` · `components/tours/{tour-form,addons-panel,schedules-panel,availability-panel,blackouts-panel}.tsx` · `app/dashboard/tours/{new,[tourId]}/page.tsx` · 11 API route files under `app/api/workspaces/[id]/{tours/**,blackout-dates/**}` · `prisma/migrations/20260710190156_phase2_tours_availability/` · `docs/11`, `docs/12`.
**Modified:** `prisma/schema.prisma` (5 models + 5 enums + relations) · `lib/{constants,validation,onboarding,utils}.ts` · `lib/auth/permissions.ts` · `lib/audit/audit-log.ts` · `app/dashboard/tours/page.tsx` (empty state → real module) · `app/dashboard/{page,onboarding/page}.tsx` · `components/app/{nav-items,app-shell}.tsx` · `package.json` (+`date-fns`, `@date-fns/tz`) · `README.md`.

## 3. Routes added

**Pages:** `/dashboard/tours` (now live), `/dashboard/tours/new`, `/dashboard/tours/[tourId]`.
**APIs:** `GET|POST /api/workspaces/:id/tours` · `GET|PATCH|DELETE …/tours/:tourId` · `GET|POST …/addons` + `PATCH|DELETE …/addons/:addonId` · `GET|POST …/schedules` + `PATCH|DELETE …/schedules/:scheduleId` + `POST …/schedules/:scheduleId/generate` · `GET|POST …/availabilities` + `PATCH|DELETE …/availabilities/:availabilityId` · `GET|POST /api/workspaces/:id/blackout-dates` + `DELETE …/:blackoutId`.

## 4. Data models added

`tours` (kind `tour/activity/package`, status `draft/active/archived`, visibility, integer-cents pricing, cancellation policy fields, waiver flag, cover-image placeholder, soft delete, unique slug per workspace) · `tour_addons` · `tour_schedules` (days-of-week array, HH:MM start, date range, overrides, active/paused) · `availabilities` (timestamptz start/end, capacity, `booked_count` reserved for Phase 3, price override, nullable `guide_id` reserved for Phase 6, `scheduled/cancelled`, **unique (tour_id, starts_at)**) · `blackout_dates` (nullable tour_id = workspace-wide). All carry `workspace_id` + indexes.

## 5. Components added

`TourForm` (create/edit incl. archive + guarded delete) · `SchedulesPanel` (create + generate 90d + pause/resume + delete) · `AvailabilityPanel` (departure table in workspace-timezone wall time, one-off creation composed via `TZDate`, cancel) · `AddonsPanel` · `BlackoutsPanel`. Read-only rendering for non-manager roles.

## 6. Security notes

- Every tour/schedule/slot/blackout lookup goes through `requireWorkspaceAccess` + scoped `requireTour/requireSchedule/requireAddon/requireAvailability` — verified: outsider read/patch/list of another tenant's tours → 404 with zero data; **client-supplied `tourId` in blackout creation is validated against the workspace** (cross-tenant injection → 404, verified).
- Role matrix verified: viewer can list/read but create/generate → 403; new-tour page renders not-found content for non-managers (page guard) while the API independently 403s (defense in depth).
- All mutations zod-validated (invalid duration/capacity/price → 400, verified); money stays integer cents; slot uniqueness enforced at the DB (duplicate one-off → 409, verified).
- 9 new audit actions written and verified in the DB during E2E: `tour_created/updated/archived`, `addon_created`, `schedule_created`, `availability_generated/created/cancelled`, `blackout_created` (plus `addon_updated/deleted`, `schedule_updated/deleted`, `availability_updated`, `blackout_deleted` wired on their endpoints).

## 7. Testing performed

```text
tsc --noEmit ✓ · eslint . ✓ · next build ✓ (46 routes)
fresh DB: prisma migrate deploy (2 migrations) + seed ✓
E2E vs production build (36 checks, all green after streaming-status note):
  tour CRUD + validation 400 · viewer 403s + read-only 200s
  tenant isolation: outsider list/read/patch 404 + cross-tenant blackout tourId 404
  schedule create → 12+ Saturday slots · Phoenix 09:00 → 16:00Z exact-instant check
  blacked-out Saturday produced no slot · capacity inheritance · re-generate → 0 (idempotent)
  one-off slot 201 → duplicate 409 → cancel → row retained as "cancelled"
  soft-delete tour → future slots auto-cancelled → tour reads 404
  pages: tours list / new / detail / read-only detail / dashboard live metric
  audit rows verified for all 9 triggered Phase 2 actions
```

Note: `/dashboard/*` pages stream (root `loading.tsx`), so a page-level `notFound()` renders not-found **content** with a 200 status — the smoke test asserts content; API guards carry the authoritative status codes.

## 8. Known gaps (deliberate)

1. **`booked_count` is always 0** — reservation logic and capacity decrement land with the booking engine (Phase 3).
2. **Schedule edits don't rewrite existing slots** — documented behavior; regenerate covers new dates, existing slots are managed individually.
3. **Blackouts don't auto-cancel existing slots** — they only gate generation; UI says so and offers per-slot cancel.
4. **Media placeholder only** — cover image is a URL field; uploads need the storage integration (later phase).
5. **Package structure is foundational** — kind + duration-days; full multi-day itinerary/bundling arrives with the itinerary builder (Phase 8+).
6. **No public tour pages yet** — visibility field is stored; the public booking surface is Phase 3.
7. Slot generation runs on demand (create + generate button); a scheduled rolling-window job is a Phase 11 hardening candidate.

## 9. Next recommended phase

**Phase 3 — Booking Engine MVP** (`docs/08_PHASE_ROADMAP.md`): public booking page per workspace slug, calendar availability from these slots, guest/participant forms, booking statuses, atomic capacity decrement against `availabilities.booked_count`, manual admin bookings, confirmation screen. Awaiting owner approval.
