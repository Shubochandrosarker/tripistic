# Tripistic — Phase 2 Implementation Plan (Tour + Availability System)

> Written before Phase 2 coding, following the same discipline as `docs/09`. Scope source: Master Prompt Phase 2 + `docs/02_MVP_FEATURE_SPEC.md` §2 + `docs/08_PHASE_ROADMAP.md`.

## 1. Starting point

Phase 1 (PR #1) is merged to `main`: multi-tenant foundation with auth, workspaces, roles, tenancy helpers, audit logging, dashboard/admin shells. Phase 2 builds the first real operational module on top of it. The working branch is restarted from the merged `main`.

## 2. Scope

**Build:** tour/activity CRUD · package structure (kind + multi-day duration) · availability rules (recurring schedules) · capacity rules (tour default → schedule override → slot value) · concrete departure slots · blackout dates · pricing fields (base price cents + per-slot override) · add-ons · public/private visibility · media placeholder fields · cancellation policy fields.

**Explicitly NOT built (later phases):** public booking page, bookings/seat holds (Phase 3), payments (Phase 4), guide assignment UI (Phase 6 — nullable `guide_id` reserved), media uploads (needs storage), seasonal pricing rules, coupons, full package bundling/itineraries.

**Gate:** an operator can define a bookable product with future availability slots; everything workspace-scoped.

## 3. Data models (all with `workspace_id` + index, timestamps; per `docs/03` conventions)

| Model | Key fields | Notes |
|---|---|---|
| `tours` | title, slug (unique per workspace), kind (`tour/activity/package`), description, duration_minutes, duration_days?, location, meeting_point, capacity, base_price (cents), currency, visibility (`public/private`), status (`draft/active/archived`), cancellation_policy, cancellation_notice_hours, waiver_required, cover_image_url (placeholder), created_by, deleted_at | Soft delete; archive = status |
| `tour_addons` | tour_id, name, description, price (cents), max_per_booking?, is_active | |
| `tour_schedules` | tour_id, name?, days_of_week int[], start_time "HH:MM", duration_minutes?, capacity?, starts_on, ends_on?, status (`active/paused`) | Recurring rule → generates slots |
| `availabilities` | tour_id, schedule_id? (SetNull), starts_at/ends_at (timestamptz), capacity, booked_count (0 until Phase 3), price_override?, guide_id? (reserved), status (`scheduled/cancelled`), notes | `@@unique(tour_id, starts_at)`; generation uses `skipDuplicates` |
| `blackout_dates` | tour_id? (null = workspace-wide), starts_on, ends_on, reason | Generation skips covered dates |

## 4. Slot generation design (the tricky part)

`lib/tours/schedule.ts`:
- Iterate calendar dates from `max(today, starts_on)` to `min(+N days, ends_on)` (N default 90, max 365).
- A calendar date's weekday is timezone-independent → `Date.UTC(y,m,d).getUTCDay()` matches `days_of_week`.
- Skip dates covered by any blackout (workspace-wide or tour-specific).
- Convert local `date + start_time` in the **workspace timezone** to a UTC instant with `TZDate` from `@date-fns/tz` (DST-correct) — new deps: `date-fns@^4`, `@date-fns/tz@^1`.
- `ends_at = starts_at + (schedule.duration_minutes ?? tour.duration_minutes)`; capacity = `schedule.capacity ?? tour.capacity`.
- Only future instants; insert via `createMany({ skipDuplicates: true })` so re-running is idempotent and cancelled slots stay cancelled.
- Editing a schedule does **not** rewrite already-generated slots (documented behavior); deleting a schedule keeps its slots (FK SetNull).

## 5. Permissions

New capability `canManageTours` = `workspace_owner | workspace_admin`. All members (guide/staff/viewer) can view the tours area read-only; management mutations 403 otherwise. Tenant isolation identical to Phase 1: all lookups scoped through `requireWorkspaceAccess`, out-of-tenant → 404.

## 6. API plan (all under `/api/workspaces/:id`, authenticated → authorized → zod → act → audit)

```text
GET|POST   /tours
GET|PATCH|DELETE /tours/:tourId                      (DELETE = soft delete/archive)
POST       /tours/:tourId/addons        PATCH|DELETE /tours/:tourId/addons/:addonId
POST       /tours/:tourId/schedules     PATCH|DELETE /tours/:tourId/schedules/:scheduleId
POST       /tours/:tourId/schedules/:scheduleId/generate   {days?} → materialize slots
GET|POST   /tours/:tourId/availabilities                    (GET ?from&to; POST = one-off slot)
PATCH|DELETE /tours/:tourId/availabilities/:availabilityId (DELETE = cancel, keeps row)
GET|POST   /blackout-dates              DELETE /blackout-dates/:blackoutId
```

Audit actions added: `tour_created/updated/archived`, `addon_created/updated/deleted`, `schedule_created/updated/deleted`, `availability_generated/created/updated/cancelled`, `blackout_created/deleted`.

## 7. UI plan

- `/dashboard/tours` — real list (title, kind, status, visibility, price, duration, upcoming-slot count) + New tour CTA + genuine empty state (no longer a phase placeholder).
- `/dashboard/tours/new` — creation form (client) → redirects to detail.
- `/dashboard/tours/[tourId]` — management page: details form, add-ons panel, schedules panel (with "Generate departures"), upcoming departures panel (one-off add, cancel), blackout dates panel. Server component fetches; client panels mutate + `router.refresh()` (same pattern as members panel).
- Nav: remove "Phase 2" badge from Tours; onboarding items **Add your first tour** / **Set your availability** become live (done-state from real counts, no phase tag); dashboard **Upcoming departures** metric goes live.
- Components: `TourForm`, `AddonsPanel`, `SchedulesPanel`, `AvailabilityPanel`, `BlackoutsPanel` under `components/tours/`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Timezone/DST bugs in slot generation | `TZDate` (maintained tz lib), E2E assertion: Phoenix 09:00 schedule → 16:00 UTC slot |
| Duplicate slots from overlapping rules | DB unique (tour_id, starts_at) + skipDuplicates |
| Unbounded generation | window capped at 365 days, future-only |
| Money parsing in UI | major-units input → `Math.round(x*100)`, integer cents everywhere |
| Scope creep into bookings | booked_count stays 0; no reservation logic; empty-state copy on bookings unchanged |

## 9. Testing checklist

- [ ] `tsc --noEmit`, `eslint .`, `next build` clean
- [ ] Fresh DB: `migrate deploy` + seed pass
- [ ] E2E: owner creates tour (201); viewer create → 403; cross-tenant tour read/patch → 404
- [ ] Add-on, schedule create; generate → slots created; count > 0; re-generate idempotent (0 new)
- [ ] Blackout date excluded from generation
- [ ] Timezone: Phoenix 09:00 → 16:00Z slot start
- [ ] One-off slot create; cancel sets `cancelled`, row retained
- [ ] Tours list + detail pages 200; upcoming-departures metric reflects slots
- [ ] Audit rows for tour/schedule/availability/blackout actions
