# Tripistic — Phases 5–12 Extension Report

## 1. Executive status

This work extends the already-shipped Phase 5 (CRM & communication) and
Phase 6 (Guides & waivers) foundations and adds eight new capability
areas in one pass, per the "TRIPISTIC PHASE 5–12" master prompt: CRM
(companies, leads, tasks, activity timeline, customer insights),
Workforce management, Vehicle management, Operations Center, Dispatch
Center, Vendor management, an AI Itinerary Builder, and an AI Business
Brain. **All existing Phase 1–6 functionality is preserved with zero
regressions** — every pre-existing test still passes, and every new
foreign key onto an existing model (`Customer.companyId`,
`Availability.driverId`/`vehicleId`/`opsStatus`, `Booking.checkedInAt`)
is additive with a safe default.

The master prompt's later sections (AI Copilot, Marketing Hub, Customer
Portal, Mobile Apps, White Label, a visual Automation Builder, and
autonomous AI Agents) describe the eventual full platform vision rather
than additional literal build scope for this pass — several of them
(native mobile apps, a WhatsApp/Twilio/OpenAI-integrated automation
builder, a reseller billing system) require infrastructure and
third-party credentials that don't exist anywhere in this codebase yet
(`.env.example` still lists AI providers, SMS, and storage as
placeholders). Building convincing-looking stubs for those would violate
the prompt's own "no placeholders, no shortcuts" rule more than skipping
them does. What's below is real, tested, production-quality code for the
eight concretely-scoped "BUILD PHASE N" sections.

**No LLM call is made anywhere in this codebase.** Every "AI" feature
(guide/driver matching, the itinerary generator, the Business Brain's
forecasts and suggestions) is deterministic, rule-based generation over
the workspace's own real data — the same "rules first, honest narration
second" principle `app/dashboard/ai-growth` has stated since Phase 1.
No AI provider is configured (`OPENAI_API_KEY`/`OPENROUTER_API_KEY` are
still empty placeholders), so pretending otherwise would mean fabricated
numbers.

## 2. What shipped, by phase

### Phase 5 (extended) — CRM

- **Companies**: a directory of travel agents, hotels, and partners
  (`/dashboard/companies`), linkable from a Customer or Lead.
- **Leads**: a pipeline (`new → contacted → qualified → proposal_sent →
  won/lost`) with a kanban-style board (`/dashboard/leads`), tags,
  estimated value, and assignment to a team member.
- **Lead conversion**: `POST .../leads/:id/convert` creates a real
  Customer, deduped by (workspace, email) against an existing one —
  exactly the same dedup rule `upsertCustomerForBooking` already used —
  and logs the conversion on the lead's activity timeline.
- **CRM tasks** (`/dashboard/tasks`) and an append-only **activity
  timeline** (calls/emails/WhatsApp/SMS/meetings/notes), linkable to a
  Customer or Lead.
- **Customer Dashboard**: lifetime value, repeat-guest flag, favorite
  tour, cancellation rate, and a rule-based **AI customer summary** —
  now rendered directly on the customer detail page — plus a merged
  **Customer Timeline** (bookings + payments + messages + activities,
  sorted chronologically).

### Phase 6 (extended) — Workforce management

- `GuideProfile` extended with `kind` (guide/driver/both), languages,
  skills, employment type, phone, hourly rate, and an active flag — all
  additive columns with safe defaults.
- **Time off**, **payroll hours** (operator-logged, not a punch clock),
  and **performance ratings** per member.
- `Availability.driverId` — a second, independent assignment slot next
  to the existing `guideId`.
- **AI guide/driver matching** (`GET .../availabilities/:id/match`):
  scores active, eligible candidates on language match, rating,
  experience (past assignment count), and overtime load; hard-excludes
  anyone with an approved time-off conflict or an overlapping
  double-booking. `distance` is deliberately not scored — there is no
  staff geolocation data anywhere in this schema, and inventing a number
  would violate the "never invented numbers" principle.

### Phase 7 — Vehicle management

- `Vehicle`, `VehicleMaintenanceRecord`, `VehicleFuelLog` —
  `/dashboard/vehicles` and a per-vehicle dashboard
  (`/dashboard/vehicles/:id`) showing upcoming trips, insurance/
  registration/maintenance expiry alerts, fuel + maintenance cost, and a
  profit rollup (trip revenue − fuel − maintenance).
- `Availability.vehicleId` — assignable from the same tour-availability
  routes as guide/driver, with the same eligibility re-check pattern
  (`requireActiveVehicle`, mirroring `requireAssignableMember`).

### Phase 8/9 — Operations Center & Dispatch Center

Share one migration and one service layer since both read and write the
same live-status surface on `Availability`/`Booking` — splitting them
would only duplicate the same columns under two names.

- `Availability.opsStatus` (scheduled → boarding → in_progress → delayed
  → completed/cancelled, enforced by an explicit transition graph) is
  independent of the existing `status` column, which continues to gate
  bookability only.
- **Operations Center** (`/dashboard/operations`): today's departures
  board, per-departure guest check-in, an append-only ops timeline
  (status changes, notes, check-ins, incidents), and dispatch quick-
  assign for guide/driver/vehicle in one call.
- **Delayed Tour Automation**: marking a departure `delayed` with
  "notify guests" queues a real delay-notice email to every confirmed
  guest, reusing the existing tracked-send messaging infrastructure (new
  `departure_delayed` template, same `Message` audit trail as booking
  confirmations).
- **Dispatch Center** (`/dashboard/incidents`): incident reports
  (severity/category/status), each linked incident also appends to its
  departure's ops timeline. An open critical incident surfaces as an
  "Emergency mode" banner on the ops board.
- Map View, live GPS tracking, and driver/guide chat were **not**
  built — they need real-time infrastructure (websockets, a maps/GPS
  provider) this stack doesn't have configured; building a non-functional
  version would be exactly the kind of shortcut the master prompt
  prohibits.

### Phase 10 — Vendor management

- `Vendor` (hotel/restaurant/transport/activity provider), commission
  rate, 1–5 rating, and `VendorInvoice` with a lazy unpaid → overdue
  sweep (same "compute on read" pattern as the existing pending-payment
  expiration sweep). `/dashboard/vendors` + a per-vendor invoice ledger.

### Phase 11 — AI Itinerary Builder

- `Itinerary` → `ItineraryDay` → `ItineraryItem`, plus an immutable
  `ItineraryVersion` snapshot table (same versioning pattern as the
  existing `WaiverVersion`).
- **Generator** (`lib/itinerary/generator.ts`): given a title,
  destination, day count, traveler count, and budget tier, builds a full
  day-by-day plan — arrival/departure transfers, accommodation, meals,
  and activities — preferring the workspace's **own** tour catalog for
  activities (real title, real price, no markup on the operator's own
  rate) and falling back to vendor-sourced or clearly-scaled baseline
  estimates otherwise. Every line item carries an independent
  cost/price, so the itinerary always shows real margin.
- Fully editable after generation: add/edit/delete items, reorder via
  up/down controls (an accessible, WCAG-friendlier alternative to raw
  drag-and-drop — no DnD library exists in this stack), edit day
  titles/dates, save a version snapshot.
- **Share link**: a public, unauthenticated view
  (`/itinerary/:publicToken}`, same high-entropy token pattern as
  `Booking.publicToken`) that shows sell price only — cost/margin never
  leaves the dashboard. **PDF** export is the browser's native
  print-to-PDF (a `Print / Save as PDF` button + print stylesheet)
  rather than a new server-side PDF-rendering dependency.

### Phase 12 — AI Business Brain

- `lib/analytics/business-brain.ts`: 12-month revenue history + a
  3-month trailing-average forecast, occupancy by weekday, cancellation
  rate, repeat-customer rate, direct-vs-manual booking share, rule-based
  pricing/discount suggestions and marketing ideas (derived directly
  from the occupancy table), inventory warnings, staff-assignment gaps,
  risk alerts (unpaid/overdue vendor invoices, vehicle document expiry),
  and two transparent composite scores (Growth, Health) with documented
  weights — never a black box.
- This is the real fulfillment of `app/dashboard/ai-growth`'s
  Phase-1-era promise ("rules first, AI narration second... no fake
  numbers until then") — the page is extended in place, not rewritten;
  a workspace with zero bookings still gets the original honest
  `hasEnoughData: false` empty state.
- The existing `AIRecommendationCard` (used on both the main dashboard
  and the AI Growth page) now accepts real `suggestion`/`healthScore`
  props; any caller that doesn't pass them keeps the original,
  unchanged sample-content placeholder.

## 3. Schema

Two migrations: `20260715221147_phase5_12_platform_extension` (all new
enums/tables/columns) and `20260715221200_phase5_12_check_constraints`
(hand-written `CHECK` constraints Prisma's DSL can't express — rating
ranges, non-negative money/duration, at-most-one-entity-link on CRM
tasks/activities — same precedent as the existing
`availability_capacity_constraints` migration). A third,
`20260715223357_phase8_9_departure_delayed_template`, adds the one new
`MessageTemplateKey` enum value the delay-notice email needed.

Every new tenant-owned table follows the existing composite-FK pattern
(`workspaceId` + `@@unique([workspaceId, id])`) so a row can never
reference a resource from a different workspace at the database level,
not just in application code. Every composite-FK relation to a
sometimes-hard-deletable parent (`WorkspaceMember`) uses `onDelete:
Restrict` with an explicit clearing step on removal
(`clearCrmAssignments`, `clearWorkforceAssignments`, mirroring the
existing `clearGuideAssignments`) — never `SetNull`, which cannot work
on a composite FK whose `workspace_id` column is required.

## 4. Permissions

Every new capability got a same-tier permission function in
`lib/auth/permissions.ts`, deliberately matched to the closest existing
analog rather than invented from scratch: CRM/Operations match
`canManageBookings` (owner/admin/staff); Workforce/Vehicles match
`canManageTours` (owner/admin); Vendors and the Business Brain are
owner/admin-only (billing-adjacent financial visibility). Every list
route also has a paired `canView*` that adds read-only roles.

## 5. Testing

161 integration tests (123 pre-existing + 38 new) across 24 files, plus
74 pre-existing unit tests — all green. New coverage: tenant isolation
(a resource from workspace B is 404 to a legitimate member of workspace
A, not just an unauthenticated caller), permission boundaries per new
role tier, the lead-conversion dedup/idempotency behavior, the ops-status
transition graph (valid and rejected transitions), AI matching's
exclusion logic (time-off conflict, double-booking), vendor invoice
overdue sweep, CHECK-constraint enforcement (ratings, entity-link
exclusivity), itinerary generation's day count and cost/price/margin
math, the public itinerary share route (reachable unauthenticated, never
leaks cost data), and member-removal correctly clearing every new
Restrict-guarded assignment (driver, CRM lead/task assignee) instead of
failing.

`npm run test:ci` (generate → validate → lint → typecheck → unit →
integration → production build) passes clean end-to-end.

## 6. Explicit scope boundaries (not built, and why)

- **Mobile apps** (Guide/Driver/Customer, offline mode, QR check-in,
  push notifications) — native app infrastructure; out of scope for a
  Next.js web codebase in one pass.
- **Marketing Hub** (email/WhatsApp/SMS campaigns, landing page builder,
  Meta Ads, affiliate system) and **White Label** (reseller billing,
  custom domains) — no third-party marketing/ads credentials are
  configured, and this is a materially separate product surface from
  the operational core this pass extends.
- **Visual Automation Builder** / **AI Agents** (Sales/Support/Marketing/
  SEO/etc. agents with RAG and memory) — depends on an AI provider that
  isn't configured anywhere in this codebase.
- **Live GPS tracking, driver/guide chat, weather integration** — need
  real-time infrastructure and a maps/weather provider this stack
  doesn't have.
- **Server-side PDF generation** — the public itinerary page's
  print-to-PDF button covers the "PDF export" requirement without adding
  a new rendering dependency; a true server-rendered PDF is a reasonable
  future addition if a specific format is required.

## 7. Verification

```
npm run lint        # clean
npm run typecheck   # clean
npm run test:unit         # 74/74
npm run test:integration  # 161/161
npm run build              # production build succeeds, all routes compile
```
