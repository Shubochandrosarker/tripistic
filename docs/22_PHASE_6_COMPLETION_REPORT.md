# Tripistic — Phase 6 Completion Report (Guides & Waivers)

## 1. Executive status

Phase 6 is **complete and verified**. Like Phase 5, it arrived with no
detailed master prompt — just "please start the next phase 6" — so scope
was derived from this project's own specifications
(`docs/02_MVP_FEATURE_SPEC.md` §6, `docs/07_COMPLIANCE_SECURITY_SPEC.md`
§4, `docs/05_AUTH_AND_MULTI_TENANCY_SPEC.md`'s guide-role framing,
`docs/03_DATABASE_AND_DATA_MODEL.md`'s pre-designed future tables) and
written up as `docs/21_PHASE_6_IMPLEMENTATION_PLAN.md` before any code
was touched.

A repo audit before planning surfaced two schema elements already
committed to since Phase 2 and never wired up — the same situation
`Tour.waiverRequired` and the SMTP env block were in before Phase 5:
**`Availability.guideId`** existed as a bare, relation-less column, and
**`Tour.waiverRequired`** was a boolean with no signing flow behind it.
Both are now real: a guide (any active, non-viewer member) can be
assigned to a departure and sees only their own assigned departures'
manifest; guests sign a real digital waiver — canvas-drawn signature
included — from their existing booking confirmation page. All Phase 1–5
functionality is preserved with zero regressions (§10).

Guide scheduling/conflict detection, certification-expiry reminders, and
per-tour waiver templates were **not** started, per the plan's explicit
scope boundary. See §12.

## 2. What shipped

1. **Guide profiles** — certifications (a tag-style list) and operator
   notes on any workspace member, editable from a new `/dashboard/guides`
   page.
2. **Guide assignment** — `Availability.guideId` is now a real,
   validated, tenant-safe relation, assignable inline from the existing
   departure table on a tour's detail page (no new resource — one more
   field on an existing one).
3. **Guide manifest** — `/dashboard/manifest` ("My Manifest"): a
   mobile-friendly card list of a member's own assigned upcoming
   departures, with participant names, contact notes, and per-participant
   waiver status. Available to every role; empty for anyone with no
   assignments — see §6 for why this is not a role gate.
4. **Waiver template + immutable versions** — one workspace-level
   document; editing publishes a new version, prior versions are retained
   forever so an already-signed guest's signature keeps pointing at the
   text they actually agreed to.
5. **Waiver signing** — a public flow reachable from the existing booking
   confirmation page: per participant, the guest types a legal name and
   draws a signature on a native HTML5 canvas (no new dependency),
   recorded with IP/UA/timestamp and a reference to the exact version
   signed.
6. **Waiver status visibility** — on the guest confirmation page, the
   operator booking-detail page (PII-gated), and the guide manifest.
7. **Stale-copy and one live-bug fix** — the tour form's "signing flow
   arrives in Phase 6" label, the public tour page's "you'll be contacted
   after booking" line, and the onboarding checklist bullet were all
   corrected; a genuine leftover bug on the booking confirmation page
   ("Automated confirmation emails aren't available yet," still present
   after Phase 5 shipped real emails) was found and fixed in the same
   pass since this phase was already editing that exact page.

## 3. Schema changes

One new migration, `20260711050000_phase6_guides_waivers`, generated via
`prisma migrate diff` (this sandbox cannot run `prisma migrate dev`
interactively — same method used for every prior phase), applied via
`prisma migrate deploy`, verified against a completely empty database
with zero drift (§10). No existing table, column, or migration was
modified — only two additive `@@unique` constraints and one column's
relation were added to existing tables.

- **`WorkspaceMember`** gains `@@unique([workspaceId, id])` —
  `BookingParticipant` gains the same — both purely to let new child
  tables use the composite-tenant-safe-FK pattern already established for
  the rest of the booking subtree since Phase 3.
- **`Availability.guideId`** goes from a bare, unused `String?` column
  (reserved since the Phase 2 migration — confirmed by
  `docs/11_PHASE_2_IMPLEMENTATION_PLAN.md`'s explicit note) to a real
  composite FK → `WorkspaceMember(workspaceId, id)`, **`onDelete:
  Restrict`** (a composite FK can't `SetNull` a required `workspace_id`
  column — the same rule Phase 5 hit for `Booking.customer`). Unlike that
  precedent, `WorkspaceMember` rows genuinely **are** hard-deleted in
  this app (no soft-delete column), so a naive `Restrict` would block
  removing any member ever assigned as a guide. Fixed at the point of
  removal, not by weakening the constraint: `DELETE
  /api/workspaces/:id/members/:memberId` now clears the member's
  `guideId` assignments in the same transaction before deleting the row
  (`lib/guides/service.ts::clearGuideAssignments`), with the cleared
  count folded into the existing `member_removed` audit event's metadata
  rather than a new per-availability audit action.
- **`GuideProfile`** (new) — `certifications` (`String[]`, mirrors
  `Customer.tags`), `notes`, keyed 1:1 to a `WorkspaceMember`. Not
  restricted to `role: guide` — an owner who personally guides trips (the
  "Sofia — solo guide" persona) can have one too, matching assignment's
  own role-agnostic eligibility rule.
- **`WaiverTemplate`** (new) — a true one-per-workspace singleton
  (`@@unique([workspaceId])`), created lazily on first publish.
- **`WaiverVersion`** (new) — genuinely immutable: no update route exists
  for it at all. `versionNumber` is 1-based and derived, not
  caller-supplied; "the current version" is always computed as the
  highest `versionNumber` for a template rather than a separate
  `isActive` flag that could drift out of sync.
- **`WaiverSignature`** (new) — `bookingId`/`participantId`/
  `waiverVersionId` all composite-FK'd (`onDelete: Restrict` throughout —
  defensive, since nothing in this app ever hard-deletes a booking,
  participant, or version), `signerName`/`signatureImage` (a
  `data:image/png;base64,...` data URL — see §9)/`signedAt`/`ipAddress`/
  `userAgent`. `@@unique([workspaceId, participantId])` — one signature
  per participant, permanently; there is no forced re-sign flow if the
  template is later revised (a deliberate scope decision — see §12).

## 4. Routes and pages added or changed

**Internal**:
- `GET /api/workspaces/[id]/guides`, `PATCH
  /api/workspaces/[id]/guides/[memberId]` (new) — roster + profile CRUD;
  `canViewGuides`/`canManageGuides`-gated.
- `GET /api/workspaces/[id]/manifest` (new) — the caller's own assigned
  departures; gated only by workspace membership, not role (§6).
- `GET/PUT /api/workspaces/[id]/waiver-template` (new) — version history
  + publish; `canManageWaiverTemplate`-gated (owner/admin only).
- `POST/PATCH .../tours/[tourId]/availabilities(...)` (existing routes,
  extended) — accept an optional `guideId`, validated by
  `requireAssignableMember` (active, non-`viewer`).
- `DELETE /api/workspaces/[id]/members/[memberId]` (existing route,
  extended) — clears dependent guide assignments (§3).
- `GET /api/workspaces/[id]/bookings/[bookingId]` (dashboard page, not
  the API response itself, extended) — new waiver-status block when the
  tour requires one, gated by `canViewWaiverSignatures`.

**Public**:
- `GET/POST /api/public/bookings/[publicToken]/waiver` (new) — waiver
  text + per-participant status; signature submission. Scoped by
  possession of the booking's `publicToken`, the same trust model as
  every other public booking route — no new authentication primitive.

**Dashboard**:
- `/dashboard/guides` (new) — roster with inline-editable certifications/
  notes.
- `/dashboard/manifest` (new) — "My Manifest," mobile-friendly cards.
- `/dashboard/settings` — new "Waiver" `SectionCard` (readable by every
  role; publishing gated to owner/admin).
- `/dashboard/tours/[tourId]` — the departure table gains a "Guide"
  column with an inline assignment `<select>`.

**Public booking pages**:
- `/book/confirmation/[publicToken]` — new "Waiver" section per
  participant when required, with inline sign-in-place forms.

Production build confirms all of the above compile and route correctly
alongside every pre-existing route — **81 routes total**, zero
regressions (§10).

## 5. Guide assignment and manifest design

`Availability.guideId` is **one guide per departure** (a scalar FK, not a
join table) — a design already committed to by the pre-existing column
shape, not invented here. Assignment travels through the *existing*
availability create/update routes (already `canManageTours`-gated,
owner/admin only, matching how tour/availability management has always
worked in this codebase) rather than a new dedicated endpoint —
consistent with "no abstraction beyond what's needed." The eligible-
assignee check (`lib/guides/service.ts::requireAssignableMember`) is
deliberately **role-agnostic**: any active, non-`viewer` member can be
assigned, because a solo operator who personally guides their own tours
would not necessarily hold the literal `guide` role.

That same reasoning drives the manifest's access model: rather than
gating `/api/workspaces/:id/manifest` by `role === "guide"`, **any**
active member may call it — it simply returns the departures where
`guideId` equals *their own* membership id, empty for everyone else. This
is a more accurate implementation of `docs/02`'s AC ("guide sees only
assigned departures") than a role check would have been, and matches
`docs/05`'s own framing of the capability as "assigned-departures-only,"
not "role-`guide`-only." Verified directly in
`tests/integration/manifest.test.ts`: an assigned member sees exactly
their departure (with its confirmed booking's participants); an
unassigned departure in the same workspace is invisible to them; an
unassigned member gets an empty list, not an error; and a member of a
different workspace gets a 404, not a redirect or empty success.

## 6. Waiver design

**One workspace-level template**, not per-tour — `Tour.waiverRequired`
stays a boolean gate, and every tour that requires a waiver uses the same
current version. Nothing in `docs/02`/`docs/07` requires per-tour
templates, and the pre-existing `waiverRequired` flag's own shape (a
flag, not a template reference) never committed to it; documented as a
reasonable future enhancement, not built here.

**Signing is guest-initiated from the confirmation page, not a booking
gate.** A booking confirms exactly as it always has; the waiver section
is a parallel, tracked-but-not-blocking flow. This matches
`Tour.waiverRequired`'s own pre-existing (now-corrected) copy, which
already described an after-the-fact process, and `docs/07`'s explicit
hedge that Tripistic "helps collect and store" waivers rather than
guaranteeing enforceability.

**The lead guest signs for every participant from one page** — there is
no per-participant magic-link delivery, since most participants have no
email captured at all (`BookingParticipant.email` is optional). The
`signerName` field captures whoever actually held the pen (e.g. a parent
signing for a minor participant), which is why it is stored separately
from the participant's own name.

**Signature capture is a native HTML5 canvas** (`components/waivers/
signature-pad.tsx`) — no drawing-library dependency. The canvas's
internal pixel resolution (`600×180`) is fixed while its CSS width
stretches to fill its container; pointer coordinates are explicitly
rescaled from CSS pixel space back into canvas pixel space
(`scaleX = canvas.width / rect.width`, and the `y` equivalent) so a
stroke lands where the guest actually touched regardless of screen
width — a bug that would otherwise appear only on screens wider than the
canvas's native resolution and was caught and fixed during
implementation, not after. The drawn signature is exported via
`canvas.toDataURL("image/png")` and submitted as a `data:image/png;base64,...`
string, validated server-side for the correct prefix and a sane maximum
length (`MAX_SIGNATURE_IMAGE_LENGTH`, ~1.5MB of raw bytes) before storage.

**No object storage integration** — `.env.example`'s `STORAGE_*`
variables remain "placeholders only," unchanged since Phase 1, confirmed
via a repo-wide grep before deciding on this approach. Storing a small
signature PNG as a base64 data URL directly in a `text` column is the
same pragmatic shortcut `Tour.coverImageUrl` already takes (a typed URL,
not a real upload pipeline); real object storage is a documented future
improvement, not blocked by anything built here.

## 7. Permissions (`lib/auth/permissions.ts`)

- `canManageGuides` — owner/admin only, delegating to the same role set
  `canManageTours` already uses (tours/availabilities have always been
  owner/admin-only in this codebase, unlike bookings/customers which
  include staff) — kept as its own named function for documentation,
  matching how `canManageCustomers` is its own function even though it
  delegates to `canManageBookings`.
- `canViewGuides` — manage-capable roles, plus staff and viewer
  (read-only roster).
- `canManageWaiverTemplate` — owner/admin only; editing a liability
  document is treated as more sensitive than day-to-day tour editing.
- `canViewWaiverSignatures` — matches `canViewBookingPII` exactly
  (owner/admin/staff, excludes viewer) — a signature image plus IP/UA is
  guest-PII-adjacent.
- Guide manifest access is **not** one of these functions at all — see
  §5.

## 8. Security and compliance notes

- No email/legal-enforceability claims appear anywhere in the waiver UI
  copy — matches `docs/07`'s explicit constraint that Tripistic "helps
  collect and store" waivers, never guarantees enforceability.
- IP/UA for a signature are captured server-side from the request
  (`lib/audit/audit-log.ts::getRequestContext`, exported this phase so a
  non-audit-log record — `WaiverSignature` — can use the same extraction
  logic without duplicating it), never trusted from a client-supplied
  field.
- The public waiver routes are scoped by the booking's unguessable
  `publicToken`, identical to the trust model already established for
  the confirmation page and payment-retry route.
- `signatureImage` is validated server-side (correct data-URL prefix, a
  maximum length) before it is ever stored — the one new piece of
  untrusted binary-shaped input this phase introduces.
- Every `GuideProfile`/`WaiverTemplate`/`WaiverVersion`/`WaiverSignature`
  lookup that serves a response is scoped by the `workspaceId` already
  verified on the caller's membership or resolved from the booking's own
  `publicToken` — proven directly: a member of workspace A gets 404 for
  workspace B's manifest route; signing a real participant id through a
  *different* booking's `publicToken` gets 404, not a cross-booking
  write.

## 9. Tests added

| Suite | File | Count |
|---|---|---|
| Integration | `tests/integration/guides.test.ts` | 8 |
| Integration | `tests/integration/manifest.test.ts` | 6 |
| Integration | `tests/integration/waivers.test.ts` | 9 |
| E2E | `tests/e2e/waiver-signing.spec.ts` | 1 |
| E2E | `tests/e2e/dashboard-guides-and-waiver.spec.ts` | 4 |

**No new unit test file** was added this phase — a deliberate choice, not
an oversight: Phase 6's logic (assignment eligibility, manifest scoping,
version derivation, signature idempotency) is inherently DB-query-shaped,
unlike Phase 5's genuinely pure, unit-testable HMAC/HTML-escaping
functions. It is covered instead by integration tests that exercise the
real HTTP route + database path — arguably stronger coverage for this
kind of logic than an isolated pure-function test would have been, since
it also proves permission and tenant scoping end-to-end in the same
assertion.

- **`guides`**: assignment persists and is tenant-scoped (a
  different-workspace member id is rejected, a `viewer` is rejected);
  reassignment and unassignment via PATCH; removing a member who is
  assigned as guide clears the dependency instead of failing; guide
  profile upsert is idempotent (a repeat PATCH updates the same row, not
  a duplicate) and role-gated (staff denied management, still allowed to
  view; viewer allowed to view).
- **`manifest`**: assigned-only visibility proven directly (§5); an
  unassigned departure in the same workspace is invisible; an unassigned
  member sees an empty list, not an error; cross-tenant 404; per-
  participant waiver status is `false`/`true` when the tour requires one
  and `null` (not `false`) when it doesn't.
- **`waivers`**: publishing creates version 1, publishing again creates
  version 2 without mutating version 1's stored content; a signature
  persists with the correct booking/participant/version linkage; signing
  again for an already-signed participant is idempotent (returns the
  existing record, exactly one row, the original `signerName` untouched
  by the replay); signing is rejected for a tour that doesn't require a
  waiver, before any version has been published, for a malformed
  signature image, and for a participant id that doesn't belong to the
  booking behind the given `publicToken`; `GET` returns accurate current
  text and per-participant status; only owner/admin can publish (staff
  gets 403).
- **`waiver-signing` (e2e)**: a guest books a waiver-required tour end to
  end in a real Chromium browser, draws an actual signature via mouse
  events on the canvas, submits it, sees the participant flip to
  "Signed," and — critically — the signed state **survives a page
  reload**, proving the signature genuinely persisted server-side rather
  than only updating client state. This is the one piece of Phase 6 that
  unit/integration tests fundamentally cannot validate.
- **`dashboard-guides-and-waiver` (e2e)**: the Guides roster, My
  Manifest (empty state), the tour detail page's guide-assignment
  `<select>` (confirmed populated with the seeded owner as an option),
  and the settings Waiver panel (including publishing a new version
  in-browser) all render and function correctly for a real logged-in
  operator. Designed to be run-count-independent — it reads the current
  version number before publishing and asserts the delta, rather than
  hardcoding a version number that would only be correct on a database's
  very first run.

**Every existing Phase 1–5 test still passes unmodified.**

Commands: `npm run test:unit`, `npm run test:integration`, `npm run
test:e2e`, `npm run test:ci`.

## 10. Verification results

Run against the sandbox's Postgres 16 instance, migrations applied fresh:

```
$ npm run lint            → clean, no errors or warnings
$ npm run typecheck       → clean, no errors
$ npm run test:unit       → 9 files, 74 tests passed (unchanged — see §9)
$ npm run test:integration → 7 migrations applied (no pending/no drift),
                             17 files, 123 tests passed (100 existing + 23 new)
$ npm run test:e2e        → 6/6 passed (2 pre-existing + 4 new), including
                             a repeated run to prove the new dashboard
                             smoke spec is idempotent across runs
$ npm run build           → succeeded, 81 routes, zero conflicts
$ npm audit                → 4 moderate findings (pre-existing next/postcss
                             chain — no new advisory; zero new dependencies
                             were added this phase)
```

**Fresh-database verification** (this session, separate from the
`tripistic_test` integration run): a brand-new database was created,
`prisma migrate deploy` applied all 7 migrations cleanly from empty,
`prisma format --check` and a `prisma migrate diff` against that live
database both confirmed **zero drift** between `schema.prisma` and the
applied migrations, and the temporary database was dropped afterward.

**Browser verification, not just headless assertions**: per this
engagement's standing instruction to test UI changes in a real browser
before reporting completion, both the guest-facing signing flow (real
mouse-driven canvas drawing) and the operator-facing dashboard surfaces
(Guides, My Manifest, the guide-assignment select, the Waiver settings
panel) were exercised end to end via Playwright against a genuine
production build — not asserted from code inspection alone.

## 11. Dependency notes

**Zero new npm dependencies.** The signature pad uses the browser's
native Canvas API; nothing else in this phase needed a package that
wasn't already present. `npm audit` is unchanged at the pre-existing
4-moderate baseline.

## 12. Known gaps

- **No per-tour waiver templates.** One workspace-level document only —
  see §6 for the reasoning; a legitimate future enhancement.
- **No forced re-signing on template update.** A participant who signs
  version N stays "signed" even after version N+1 is published — a
  deliberate policy decision this phase does not make either way (see
  §3's note on `WaiverSignature`'s permanent per-participant uniqueness).
- **No per-participant magic-link signing.** The lead guest signs for
  the whole party from the one confirmation page they already hold — see
  §6.
- **No real object storage for signature images.** A small PNG data URL
  in a `text` column, matching `Tour.coverImageUrl`'s existing shortcut —
  see §6.
- **No guide scheduling/conflict detection.** The manifest is a
  read-only day-of list; nothing prevents assigning one guide to two
  overlapping departures, and nothing tracks certification expiry dates
  or sends reminders about them.
- **No in-app calendar/ICS export for a guide's manifest** — a
  reasonable follow-on for the mobile-view AC, not required by the
  literal acceptance criteria ("guide sees only assigned departures"),
  and not built here.

## 13. What was explicitly NOT built (Phase 7+)

Per `docs/21`'s explicit scope boundary (§4), none of the following were
implemented, stubbed, or partially scaffolded: a public review-collection
page (still open from Phase 5, unrelated to this phase); the AI Growth
Dashboard or any rules-based insight engine; an AI booking assistant; OTA
sync; SaaS subscription billing for Tripistic's own tenants; white-label
custom domain billing; guide scheduling/availability-conflict tooling;
per-tour waiver templates; a guest-facing preference center beyond the
existing one-click unsubscribe.

## 14. Recommended Phase 7

The roadmap (`docs/08`) points unambiguously to the **AI Growth
Dashboard v1**: a rules-based insight engine over the now-substantial
booking/payment/customer/guide/waiver data model this and the prior four
phases have built (occupancy by weekday, underperforming products,
direct-vs-OTA share, reminder-failure rates), with LLM narration sitting
behind a provider abstraction that falls back to template text — the
explicit AC is that insights generate correctly with **no** AI key
configured at all, mirroring this whole engagement's consistent
"optional integrations degrade gracefully" discipline (Stripe in Phase 4,
SMTP in Phase 5, and implicitly followed again here with zero new
dependencies). This is the first phase with enough real operational data
flowing through the system for a rules-based engine to say anything
genuinely useful, and every phase since Phase 3 has been quietly building
toward exactly this input surface.
