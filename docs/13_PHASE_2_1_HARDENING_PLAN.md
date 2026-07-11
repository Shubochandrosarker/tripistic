# Tripistic — Phase 2.1 Hardening Plan

> Written before Phase 2.1/Phase 3 coding, per `TRIPISTIC_PHASE_3_MASTER_PROMPT.md` §3 and the findings in `TRIPISTIC_PHASE_2_CODE_AUDIT.md`. This plan covers Part A of the master prompt only. Phase 3 scope is `docs/14_PHASE_3_IMPLEMENTATION_PLAN.md`.

## 1. Current-state findings (confirmed by direct inspection)

| Audit finding | Confirmed at | Verdict |
|---|---|---|
| `dateOnlySchema` uses `Date.parse()`, accepts `2026-02-29`/`2026-02-31` | `lib/validation.ts:101-104` | Confirmed — regex `\d{4}-\d{2}-\d{2}` + `Date.parse` normalizes instead of rejecting |
| Workspace timezone accepts any 1-64 char string | `lib/validation.ts:38,47` (`createWorkspaceSchema`/`updateWorkspaceSchema`) | Confirmed |
| Schedule create + generate are two non-transactional steps | `app/api/workspaces/[id]/tours/[tourId]/schedules/route.ts:45-64` | Confirmed — `tourSchedule.create` then `generateSlotsForSchedule` outside any transaction |
| Archived tours can still generate slots | `schedules/[scheduleId]/generate/route.ts` has no tour-status check; `generateSlotsForSchedule` only checks `schedule.status` | Confirmed |
| PATCH-archive and DELETE behave differently | PATCH (`tours/[tourId]/route.ts` PATCH) only flips `status`; DELETE additionally cancels future scheduled availabilities in a transaction | Confirmed |
| Schedule PATCH doesn't validate merged date range | `schedules/[scheduleId]/route.ts` PATCH applies `startsOn`/`endsOn` independently, no merged-range check | Confirmed |
| Availability GET query unchecked | `availabilities/route.ts` GET does `new Date(fromParam)` / `new Date(toParam)` directly, no schema | Confirmed |
| No capacity DB constraints | `prisma/schema.prisma` `Availability` has no `@@check` / raw constraint | Confirmed (Prisma has no native check-constraint DSL — must hand-write SQL in a migration) |
| No composite tenant FK anywhere | All child tables (`TourAddon`, `TourSchedule`, `Availability`, `BlackoutDate`) use single-column FKs to `Tour.id` only; `workspaceId` match is enforced only by `lib/tours/service.ts` scoped lookups | Confirmed |
| No automated tests, no CI | Repo-wide search: zero `*.test.*`/`*.spec.*` files, no `.github/` directory, no test runner in `devDependencies` | Confirmed |
| `next-auth@5.0.0-beta.29` below advisory-fixed version | `npm audit` reports `GHSA-5jpx-9hw9-2fx4`, fixed in `5.0.0-beta.31` (no major bump) | Confirmed |
| `postcss`/`next`/`geist` moderate advisories | Next.js is already pinned to the newest 15.x (`15.5.20`); the postcss fix requires a Next **16** major bump | Confirmed — deferred, see §7 |
| Caret ranges instead of exact pins | `package.json` dependencies use `^` | Confirmed |

## 2. Scope of this hardening pass

Fix every P0/P1 item from the audit that gates public booking traffic, in the order the master prompt requires (§4–§13), **without** rewriting Phase 1/2 architecture. Every change below is additive or corrective to existing files; no existing route, page, or component is removed.

## 3. Exact changes

### 3.1 Strict date validation (§4)

- Add `isValidCalendarDate(year, month, day)` to `lib/validation.ts`: constructs a `Date.UTC(...)` value and round-trips `getUTCFullYear/getUTCMonth/getUTCDate` back against the input — JS silently rolls `Feb 31 → Mar 3`, so a round-trip mismatch is the rejection signal. No new dependency.
- Replace `dateOnlySchema` to regex-match `YYYY-MM-DD` **and** call `isValidCalendarDate`. Keep the schema's output type (`string`) unchanged so every existing caller (`createScheduleSchema`, `updateScheduleSchema`, `createBlackoutSchema`) keeps working without edits.
- Reused as-is for the new Phase 3 public-availability date-range schema (§3.6 below and Phase 3 plan).
- Unit tests: valid leap year (`2028-02-29`), invalid leap year (`2026-02-29`), month boundary (`2026-04-31`), malformed (`26-1-1`, `2026/01/01`), non-numeric, empty string.

### 3.2 IANA timezone validation (§5)

- Add `ianaTimezoneSchema` to `lib/validation.ts`: `z.string().trim().min(1).max(64).refine(isValidIanaTimezone)`, where `isValidIanaTimezone(tz)` wraps `new Intl.DateTimeFormat(undefined, { timeZone: tz })` in try/catch. This is the Node/V8-native IANA check the master prompt calls for — no new dependency.
- Swap `createWorkspaceSchema.timezone` and `updateWorkspaceSchema.timezone` to use it. The existing `TIMEZONES` constant list in the UI `<select>` is kept as-is (curated UX list); the schema now independently rejects anything outside the IANA database regardless of what the UI offers, closing the API-level gap the audit flagged.
- Schedule generation already receives `membership.workspace.timezone`, which is now guaranteed valid at write time — no change needed inside `lib/tours/schedule.ts` itself, but `generateSlotsForSchedule` is wrapped in the same try/catch as the rest of the transaction (§3.3) so a legacy bad value (pre-existing row) still surfaces as a safe 400/409, never a 500.
- Unit tests: `America/Phoenix`, `UTC`, `Europe/London` accepted; `Not/AZone`, `''`, `America/Nowhere` rejected.

### 3.3 Transaction-safe schedule creation (§6)

- Refactor `lib/tours/schedule.ts::generateSlotsForSchedule` to accept a Prisma client/transaction handle as its first argument (`Prisma.TransactionClient | PrismaClient`) instead of importing the global `prisma` singleton directly. This is the minimal change that makes it usable both inside a transaction and standalone (the existing `POST .../schedules/:scheduleId/generate` route keeps calling it with the plain `prisma` client — behavior unchanged there).
- `POST /api/workspaces/[id]/tours/[tourId]/schedules` now wraps `tourSchedule.create` + `generateSlotsForSchedule` in one `prisma.$transaction(async (tx) => {...})`. If generation throws, the transaction rolls back and **no schedule row is left behind** — closing the audit's "orphaned schedule on retry" gap. Response shape (`{ schedule, generatedSlots }`) is unchanged.
- Interactive-transaction default timeout (5s) is sufficient: generation is one `createMany` over ≤365 days × ≤7 weekdays, a bounded, fast bulk insert.

### 3.4 Canonical archive service (§7)

- New `lib/tours/archive.ts` exporting `archiveTour(tx, { workspaceId, tourId, actorUserId, softDelete, request })`:
  1. Loads the tour tenant-scoped (reuses `requireTour`-equivalent inside the transaction).
  2. Sets `status = archived` (idempotent if already archived).
  3. Pauses all `active` schedules for the tour (`status = paused`).
  4. Cancels future (`startsAt > now`) `scheduled` availabilities for the tour.
  5. When `softDelete` is true (DELETE route only), also sets `deletedAt = now()`.
  6. Returns `{ tour, pausedSchedules, cancelledSlots }`.
- `PATCH .../tours/:tourId` now calls `archiveTour` (inside a transaction) instead of a bare `status` update **only when the incoming `status === "archived"` and the tour isn't already archived**; all other PATCH fields keep the existing direct-update path. `DELETE .../tours/:tourId` now calls the same function with `softDelete: true`, replacing its bespoke inline transaction. This removes the PATCH/DELETE behavioral gap the audit flagged: both now pause schedules and cancel future slots identically; only soft-delete (catalog visibility) differs.
- `POST .../schedules/:scheduleId/generate` and the schedule-creation transaction (§3.3) both reject with `409 conflict` when `tour.status === "archived"` before generating — archived tours can never gain new availability, closing the audit's P0.
- Public tour/availability queries (built in Phase 3) filter `status: "active"`, `visibility: "public"`, `deletedAt: null` at the query level from day one, so archived/draft/private/deleted tours are structurally unreachable rather than filtered ad hoc.
- Dashboard upcoming-departure counts already filter `tour: { deletedAt: null }` (Phase 2) but not `status`; add `tour: { deletedAt: null, status: { not: "archived" } }` to the dashboard and tour-list upcoming-slot counts so an archived-but-not-deleted tour's stale future slots (if any existed pre-hardening) don't inflate the metric.
- The booking-conflict extension ("block archive/delete when active future bookings exist") is added to this same file in the Phase 3 pass (task tracked separately) once the `Booking` model exists — `archiveTour` is written now with that check as a clearly marked no-op hook so the Phase 3 change is additive, not a rewrite.

### 3.5 Schedule update validation (§8)

- `PATCH .../schedules/:scheduleId` now merges the incoming partial patch onto the *existing* schedule's `startsOn`/`endsOn` (converted to date-only strings via the existing `dateKey` helper) before validating, then rejects `endsOn < startsOn` with 400 — closing the audit's "patch only one side of the range" gap. No schema shape change (the fix is in the route handler, using the already-hardened `dateOnlySchema`).

### 3.6 Availability query validation (§9)

- New reusable `availabilityQuerySchema` in `lib/validation.ts`: `from`/`to` as optional ISO datetime strings (`z.coerce.date()` guarded by `.refine(!isNaN)`), `.refine(to >= from)` when both present, and a **365-day maximum window** enforced by the same schema (mirrors `SLOT_GENERATION_MAX_DAYS`). Applied to:
  - `GET .../tours/:tourId/availabilities` (existing internal route — currently constructs `Date` objects directly from unvalidated query params).
  - The new public availability endpoint (Phase 3).
- Invalid input now returns `400` with the standard `{ error, details }` shape instead of an unhandled path reaching Prisma.

### 3.7 Capacity invariants (§10)

- Service-level: availability capacity edits (`PATCH .../availabilities/:availabilityId`) reject `capacity < bookedCount` with a 400 that states the booked count and minimum allowed value (this becomes load-bearing once bookings exist in Phase 3, but the guard is correct and inert — `bookedCount` is always `0` today — so it ships now).
- Database-level: a new migration adds three named CHECK constraints directly in hand-written SQL (Prisma's schema DSL has no check-constraint syntax, so these are not represented in `schema.prisma`; Prisma Migrate does not manage or drop SQL it doesn't model, so this is safe across future `migrate dev` runs — documented inline in the migration and in `schema.prisma` as a comment on `Availability`):
  ```sql
  ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_capacity_positive" CHECK ("capacity" > 0);
  ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_booked_count_nonnegative" CHECK ("booked_count" >= 0);
  ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_booked_count_le_capacity" CHECK ("booked_count" <= "capacity");
  ```
- Integration test (Postgres-backed): attempt a raw `UPDATE` that violates each constraint and assert Postgres rejects it — proves the DB, not just the app, enforces the invariant.

### 3.8 Tenant-integrity hardening (§11)

- Decision (documented here per master-prompt §3 "permission decisions"): full composite tenant-aware foreign keys are **not** retrofitted onto every existing Phase 2 child table (`TourAddon`, `TourSchedule`, `BlackoutDate`). Those already go exclusively through the scoped helpers in `lib/tours/service.ts` (`requireTour`/`requireSchedule`/`requireAddon`/`requireAvailability`), which are the sole write path and are covered by new cross-tenant injection integration tests (create/read/update/delete with a foreign `tourId`/`scheduleId`/`addonId` under a workspace the caller doesn't belong to → 404, zero rows affected). Retrofitting composite FKs onto all of them would touch every Phase 2 relation for marginal additional safety over well-tested application guards, conflicting with the master prompt's own caution against making "Prisma relations unmaintainable."
- Where it matters most — the **new** Phase 3 `Booking` subtree, which is the actual new tenant-crossing risk surface (public, unauthenticated, money-bearing) — composite FKs are used as the primary relation, not an add-on: `Tour` and `Availability` each gain `@@unique([workspaceId, id])`, and `Booking.tour`/`Booking.availability` relate via `@relation(fields: [workspaceId, tourId], references: [workspaceId, id])` (and the availability equivalent). This makes it a **database-enforced impossibility** to persist a booking whose `tourId`/`availabilityId` belongs to a different workspace than its `workspaceId`, on top of the canonical service's own explicit tenant-scoped fetches. Full detail in `docs/14_PHASE_3_IMPLEMENTATION_PLAN.md` §3.
- New cross-tenant injection tests added for both the Phase 2 surfaces (this section) and the Phase 3 booking surfaces (next doc).

### 3.9 Tests and CI foundation (§12)

- **Vitest** for unit tests (`test:unit`) and Postgres-backed integration tests (`test:integration`) — chosen over Jest for native ESM/TS speed with zero babel config, consistent with the Next 15/TS-strict stack already in place.
- **Playwright** for the critical public-booking browser flow (`test:e2e`), run against `next build && next start` with a seeded Postgres database.
- New `package.json` scripts: `test`, `test:unit`, `test:integration`, `test:e2e`, `test:ci` (chains generate → validate → migrate deploy → seed → unit → integration → build), plus `db:migrate:test`/`db:reset:test` helpers used by the integration setup.
- `.nvmrc` pinned to `20` (matches the existing `engines.node >= 20` and the sandboxed runtime's Node 22 is compatible with a `>=20` floor; CI pins the exact `20.x` LTS line for reproducibility).
- `.github/workflows/ci.yml`: `services: postgres:16`, steps = checkout → setup-node (from `.nvmrc`) → `npm ci` → `prisma generate` → `prisma format --check` → `prisma validate` → `prisma migrate deploy` → `db:seed` → `lint` → `typecheck` → `test:unit` → `test:integration` → `build` → (Playwright job, `test:e2e`, only if the app boots cleanly in CI).

### 3.10 Dependency hardening (§13)

- `next-auth`: `5.0.0-beta.29` → `5.0.0-beta.31` (fixes `GHSA-5jpx-9hw9-2fx4`, no breaking change per Auth.js beta changelog scope — same v5 credentials-provider API surface already in use).
- `next`/`geist`/`postcss` moderate advisory: **not** force-downgraded (the audit doc explicitly forbids this, and npm's suggested "fix" — `next@9.3.3` — is an ancient pre-App-Router release, i.e. actively wrong). The fix requires a Next.js **16** major upgrade, which is an app-router/React-19-compatibility-risk decision out of scope for a hardening sprint that must not destabilize Phase 1/2. Documented as a known, accepted, low-severity (CVSS 6.1, reflected-XSS-via-attacker-controlled-stylesheet-content, not exploitable through this app's static Tailwind-compiled CSS pipeline) residual finding for a future dedicated Next 16 migration.
- All core runtime deps pinned to exact resolved versions (drop `^`): `next` `15.5.20`, `next-auth` `5.0.0-beta.31`, `@prisma/client`/`prisma` `6.19.3`, `react`/`react-dom` `19.2.7`... — pinned to the versions actually installed and tested in this sandbox (see completion report for the final exact list), not blindly bumped to whatever is newest, since every bump must go through the full verification gate in this same session.
- Lockfile regenerated via `npm install` after `package.json` edits; full verification suite reruns after.

## 4. Explicit out-of-scope for this hardening pass

- No Postgres Row-Level Security (still Phase 11, per `docs/03` §3).
- No rate limiting (still Phase 11, per `docs/04`/`docs/07`).
- No Next.js 16 migration.
- No behavior change to Phase 1 auth/members/invitations/settings/admin routes beyond the timezone-schema tightening.

## 5. Gate

Phase 3 public-booking work does not begin until: strict date/timezone unit tests pass, schedule creation is transaction-safe (verified by a forced-failure integration test), archived tours cannot generate/appear, capacity CHECK constraints exist and are proven by a raw-SQL violation test, and `lint`/`typecheck`/`test:unit`/`test:integration`/fresh migration all pass locally in this sandbox. Results are recorded in `docs/15_PHASE_2_1_HARDENING_REPORT.md`.
