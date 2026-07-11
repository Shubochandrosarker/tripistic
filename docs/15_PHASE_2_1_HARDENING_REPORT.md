# Tripistic — Phase 2.1 Hardening Completion Report

**Status: ✅ Complete and gate passed.** Every P0/P1 item from `TRIPISTIC_PHASE_2_CODE_AUDIT.md` and every requirement in Part A of `TRIPISTIC_PHASE_3_MASTER_PROMPT.md` is implemented, tested against real PostgreSQL, and verified on a fresh database. Phase 3 booking-engine work only began after this gate passed.

## 1. What was completed

| Audit/master-prompt item | Status |
|---|---|
| Strict calendar-date validation (reject `2026-02-29`, `2026-02-31`, etc.) | ✅ |
| IANA timezone validation on workspace create/update | ✅ |
| Transaction-safe schedule creation (create + generate atomic, no orphaned schedule on failure) | ✅ |
| Canonical archive service — one archive/delete path for PATCH and DELETE | ✅ |
| Archived tours structurally cannot generate departures (defense in depth: route guard + service-level guard) | ✅ |
| Schedule PATCH merges with stored values before validating the date range | ✅ |
| Reusable availability query schema (`from`/`to`, 400 on invalid, 365-day max window) | ✅ |
| Capacity invariants: app-level guard + database CHECK constraints | ✅ |
| Tenant-integrity decision documented and enforced (scoped helpers + new Phase-3 composite FKs) | ✅ |
| Vitest unit + PostgreSQL integration test foundation | ✅ |
| GitHub Actions CI (lint, typecheck, unit, integration, build, Playwright) | ✅ |
| Dependency hardening (`next-auth` advisory fixed, versions pinned exactly) | ✅ |

## 2. Exact changes

### 2.1 Strict date validation (§4)

- `lib/validation.ts`: added `isValidCalendarDate(year, month, day)` — round-trips `Date.UTC` components against the input instead of trusting JS's silent normalization. `dateOnlySchema` now regex-matches `YYYY-MM-DD` **and** calls this function.
- Applied automatically everywhere `dateOnlySchema` was already used: `createScheduleSchema`, `updateScheduleSchema`, `createBlackoutSchema` — no call sites needed changes.
- 8 dedicated unit tests in `tests/unit/validation.test.ts` (leap year valid/invalid, month boundaries, malformed formats, round-trip on both `createScheduleSchema` and `createBlackoutSchema`).

### 2.2 IANA timezone validation (§5)

- `lib/validation.ts`: added `isValidIanaTimezone(timezone)` (safe `Intl.DateTimeFormat` refinement) and `ianaTimezoneSchema`. Wired into `createWorkspaceSchema.timezone` and `updateWorkspaceSchema.timezone`, replacing the previous `min(1).max(64)` string check.
- **Found and fixed during implementation:** `TZDate` from `@date-fns/tz` does **not** throw for an unrecognized timezone — it silently produces an invalid `Date` (`getTime()` returns `NaN`), which the existing future-only filter in `computeSlotInstants` then silently drops, turning a bad timezone into "0 slots generated" instead of a visible error. `lib/tours/schedule.ts::generateSlotsForSchedule` now validates the timezone explicitly at the top and throws a clear error, so a bad value is a loud, transaction-rolled-back failure, never a silent no-op. Verified by `tests/integration/schedule-transaction.test.ts`.
- 5 unit tests for valid/invalid zones, including one confirming a SQL-injection-shaped string is rejected as a timezone rather than passed through anywhere.

### 2.3 Transaction-safe schedule creation (§6)

- `lib/tours/schedule.ts::generateSlotsForSchedule` now takes a `Db` (either the module `prisma` singleton or a `Prisma.TransactionClient`) as its first argument instead of importing the global client directly.
- `POST /api/workspaces/[id]/tours/[tourId]/schedules` wraps `tourSchedule.create` and `generateSlotsForSchedule` in one `prisma.$transaction(async (tx) => ...)`. Proven by an integration test that forces a mid-transaction failure (invalid timezone) and asserts the schedule row does **not** persist.
- The standalone regenerate endpoint (`.../schedules/:scheduleId/generate`) is unaffected in behavior — it still calls the function with the plain `prisma` client, one call, no transaction needed there since it isn't paired with a create.

### 2.4 Canonical archive service (§7)

- New `lib/tours/archive.ts::archiveTour({ workspaceId, tourId, softDelete })` — the only place a tour transitions to `archived`. In one transaction: sets `status = archived` (+ `deletedAt` when `softDelete`), pauses active schedules, cancels future scheduled availabilities.
- `PATCH .../tours/:tourId` now routes the `status → archived` transition through this function (other field edits still use a plain update); `DELETE .../tours/:tourId` calls it with `softDelete: true`. Both now pause schedules and cancel future slots identically — the audit's PATCH/DELETE behavioral gap is closed.
- Archived-tour generation is blocked in two independent places: the schedule-creation and regenerate routes return `409` before calling the service, and `generateSlotsForSchedule` itself returns `0` for an archived tour even if a caller bypassed the route guard.
- Dashboard/onboarding/tour-list "upcoming departures" counts now filter `status: { not: "archived" }` in addition to `deletedAt: null`.
- Extended in the Phase 3 pass (once the `Booking` model existed) to reject archiving/deleting a tour with active future bookings — see `docs/16_PHASE_3_COMPLETION_REPORT.md` §3.

### 2.5 Schedule update validation (§8)

- `PATCH .../schedules/:scheduleId` merges the incoming patch onto the schedule's *stored* `startsOn`/`endsOn` before validating `endsOn >= startsOn`, so a `startsOn`-only or `endsOn`-only edit can no longer produce a stored inverted range.

### 2.6 Availability query validation (§9)

- New `availabilityQuerySchema` in `lib/validation.ts`: optional `from`/`to` ISO timestamps, `to >= from`, and a 365-day (`AVAILABILITY_QUERY_MAX_DAYS`) maximum window. Applied to the existing internal `GET .../availabilities` route and reused as-is by the new public availability endpoint in Phase 3.

### 2.7 Capacity invariants (§10)

- Service-level: `PATCH .../availabilities/:availabilityId` rejects `capacity < bookedCount` with a 400 naming the current booked count and minimum allowed value.
- Database-level: migration `20260710193000_availability_capacity_constraints` adds three named CHECK constraints directly in hand-written SQL (`capacity > 0`, `booked_count >= 0`, `booked_count <= capacity`) — not representable in Prisma's schema DSL, documented with a schema comment. Verified safe across future `prisma migrate dev` runs (`Database schema is up to date!`, no drift) and proven functionally by `tests/integration/capacity-constraints.test.ts`, which attempts each violation via raw SQL and asserts Postgres rejects it (error code `23514`).

### 2.8 Tenant-integrity hardening (§11)

Decision (documented at the time in `docs/13_PHASE_2_1_HARDENING_PLAN.md` §3.8, executed as planned): existing Phase 2 child tables (`TourAddon`, `TourSchedule`, `BlackoutDate`) keep application-layer scoping through `lib/tours/service.ts`'s `requireTour`/`requireSchedule`/`requireAddon`/`requireAvailability` as the sole write path, now covered by dedicated cross-tenant injection tests (`tests/integration/tenant-scoping.test.ts` — 4 tests, each proving a foreign workspace/tour/schedule/addon/availability ID resolves to 404 with zero rows touched). Composite database-level tenant-safety (via `@@unique([workspaceId, id])` + composite foreign keys) was reserved for the **new** Phase 3 `Booking` subtree, where it matters most (public, unauthenticated, money-bearing) — see the Phase 3 report.

### 2.9 Tests and CI foundation (§12)

- **Vitest** (`vitest.unit.config.ts`, `vitest.integration.config.ts`) — unit tests run with no database; integration tests run against a dedicated `tripistic_test` database, reset once per run via a `globalSetup` that truncates every application table discovered through `information_schema` (not a hardcoded list, so it stays correct as the schema grows). Every integration test builds its own uniquely-namespaced fixtures, so tests are safe to run concurrently.
- **Playwright** (`playwright.config.ts`) configured against a production build + `prisma/seed-e2e.ts` fixture; the actual critical-flow spec is delivered in Phase 3 (`tests/e2e/booking-flow.spec.ts`), since there was nothing bookable to test yet in this phase.
- `package.json` scripts: `test` (= `test:unit`), `test:unit`, `test:integration`, `test:e2e`, `test:ci`. `scripts/test-integration.sh` and `scripts/test-e2e.sh` handle env loading (falling back to CI-provided env vars when the gitignored `.env.test` isn't present) and migration.
- `.nvmrc` pinned to `20`.
- `.github/workflows/ci.yml`: a `test` job (Postgres 16 service → clean install → `prisma generate` → `prisma format --check` → `prisma validate` → fresh `migrate deploy` → `db:seed` → `lint` → `typecheck` → `test:unit` → `test:integration` → `build` → `npm audit` report) and a separate `e2e` job (installs Chromium, runs `test:e2e`, uploads the Playwright report as an artifact).

### 2.10 Dependency hardening (§13)

- `next-auth`: `5.0.0-beta.29` → `5.0.0-beta.31` — fixes the direct advisory (`GHSA-5jpx-9hw9-2fx4`, email misdelivery), confirmed gone from `npm audit` output after the bump; same v5 credentials-provider API, no code changes required.
- `next` / `geist` / `postcss` moderate advisory (`GHSA-qx2v-qp2m-jg93`, reflected XSS via unescaped `</style>` in PostCSS's stringify output): **not** force-downgraded. `next` is already pinned to the newest 15.x release (`15.5.20`); npm's suggested "fix" (`next@9.3.3`) is a pre-App-Router release from years earlier and would be a severe regression, not a fix. The real fix requires a Next.js **16** major upgrade, which risks App Router/React 19 compatibility churn and is explicitly out of scope for a hardening sprint whose job is to *not* destabilize Phase 1/2. Documented here as a known, accepted, low-exploitability (this app's Tailwind-compiled CSS pipeline has no attacker-controlled stylesheet content path) residual finding for a future dedicated Next 16 migration.
- All core runtime and dev dependencies pinned to exact versions (no `^`) at whatever was actually installed and tested in this sandbox: see `package.json`. Lockfile regenerated; full verification suite reran clean after every dependency change.

## 3. Tests added (this phase)

| Suite | File | Count |
|---|---|---|
| Unit | `tests/unit/validation.test.ts` | 23 |
| Integration | `tests/integration/schedule-transaction.test.ts` | 3 |
| Integration | `tests/integration/capacity-constraints.test.ts` | 4 |
| Integration | `tests/integration/tenant-scoping.test.ts` | 4 |
| Integration | `tests/integration/archive.test.ts` | 4 |

Run with: `npm run test:unit` and `npm run test:integration` (the latter runs `prisma migrate deploy` against `tripistic_test` first).

## 4. Fresh-database verification result

Run in this sandbox against a PostgreSQL 16 instance, database dropped and recreated immediately before each step below (genuinely empty, not just re-migrated):

```text
npm ci                          ✓
prisma generate                 ✓
prisma format --check           ✓ "All files are formatted correctly!"
prisma validate                 ✓ "The schema at prisma/schema.prisma is valid"
prisma migrate deploy (empty DB) ✓ 3 migrations applied cleanly (init, phase2, capacity constraints)
prisma db seed                  ✓ 4 plans seeded, platform admin skipped (no SEED_ADMIN_* set)
eslint .                        ✓ zero errors, zero warnings
tsc --noEmit                    ✓ zero errors
vitest (unit)                   ✓ 23/23 passed
vitest (integration, fresh DB)  ✓ 15/15 passed
next build                      ✓ production build succeeded
```

## 5. Known limitations carried forward

- Postgres Row-Level Security remains Phase 11 scope (app-layer scoping only, as before).
- Rate limiting remains explicitly out of scope (Phase 11); documented as a deployment-time WAF/CDN recommendation instead of an in-app limiter.
- The `next`/`postcss` moderate advisory remains open pending a dedicated Next.js 16 migration (see §2.10).

## 6. Gate verdict

**Phase 2.1 hardening: ✅ approved.** All strict date/timezone tests pass, schedule creation is proven transaction-safe against a forced failure, archived tours cannot generate or appear publicly, capacity is enforced at both the application and database level, the test/CI foundation exists and is green, and a fresh-database migration/seed/lint/typecheck/test/build cycle passes end to end. Phase 3 public-booking work began only after this report's checks were green.
