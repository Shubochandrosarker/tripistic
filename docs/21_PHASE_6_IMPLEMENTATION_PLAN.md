# Tripistic — Phase 6 Implementation Plan (Guides & Waivers)

Like Phase 5, this phase was launched with a one-line instruction ("please
start the next phase 6") and no detailed master prompt. Scope below is
derived entirely from this project's own pre-existing specification
documents — quoted verbatim where it matters — following the exact
approach `docs/19_PHASE_5_IMPLEMENTATION_PLAN.md` used, and written before
any code changes, per this engagement's standing practice.

## 1. Source-of-truth requirements

**`docs/02_MVP_FEATURE_SPEC.md` §6** (verbatim):
> Guide assignment per departure, daily manifest (mobile-friendly),
> certifications/notes; waiver templates with immutable versions,
> signature records (name, signature, timestamp, IP, user agent,
> participant + booking linkage). AC: guide sees only assigned
> departures; signed waiver attaches to participant.

**`docs/07_COMPLIANCE_SECURITY_SPEC.md` §4** (verbatim):
> - Waiver text versions are **immutable**; edits create new versions.
> - Signature record stores: signed document snapshot/version ref, name,
>   signature, timestamp, IP, user agent, booking + participant ids.
> - Marketing language: Tripistic *helps collect and store* waivers;
>   **never** claim guaranteed legal enforceability.

**`docs/08_PHASE_ROADMAP.md` row 6**: "Guide profiles/assignment, daily
manifest, guide mobile view, waiver templates/versions/signatures" — AC
"Guide sees only assigned departures; signed waiver attached."

**`docs/05_AUTH_AND_MULTI_TENANCY_SPEC.md` §2** (verbatim, on the `guide`
role's current state): "`guide` has no booking-management access yet —
full guide-assignment scoping (assigned-departures-only) is a Phase 6
feature; today a `guide` member gets 403 on booking routes, not partial
access."

**`docs/03_DATABASE_AND_DATA_MODEL.md` §5** (future tables, pre-designed):
> - **waiver_templates** / **waiver_versions** (immutable) /
>   **waiver_signatures** (signed snapshot ref, participant_id,
>   booking_id, signed_at, ip, user_agent)
> - **guides** profile extension + **assignments** (availability_id,
>   guide_id)

## 2. Two pre-existing stubs this phase closes

A repo audit before writing this plan (mirroring the audit that grounded
Phase 5) found two schema elements already committed to in earlier phases
and never wired up — exactly the situation `Tour.waiverRequired` and
`.env.example`'s SMTP block were in before Phase 5:

1. **`Availability.guideId`** (`String? @map("guide_id")`) has existed
   since the Phase 2 migration with **no Prisma relation at all** — a
   bare, unvalidated, unused nullable column. `docs/11_PHASE_2_IMPLEMENTATION_PLAN.md`
   confirms this was deliberate: "guide assignment UI (Phase 6 — nullable
   `guide_id` reserved)." This settles a design question this plan would
   otherwise have to make from scratch: assignment is **one guide per
   departure** (a scalar FK), not a many-to-many join table.
2. **`Tour.waiverRequired`** (`Boolean @default(false)`) has existed since
   Phase 2 and is already surfaced in the tour form ("Waiver required
   (signing flow arrives in Phase 6)") and the public tour page ("You'll
   be contacted with details after booking"). Both are stale placeholder
   copy this phase replaces with a real flow.

## 3. What ships

1. **Guide profiles** — certifications (tags-style list) and operator
   notes on any workspace member, editable from a new "Guides" dashboard
   page.
2. **Guide assignment** — `Availability.guideId` promoted to a real,
   validated, tenant-safe relation; assignable from the existing
   availability create/edit surface (no new resource — it is one more
   field on an existing one, per this codebase's "no abstraction beyond
   what's needed" convention).
3. **Guide manifest** — any member can see the departures *they* are
   assigned to (participant list, contact notes, waiver status), and
   nothing else. This is the literal implementation of the AC "guide sees
   only assigned departures."
4. **Waiver template + immutable versions** — one workspace-level waiver
   document; editing creates a new version, old versions are retained
   forever (already-signed signatures keep pointing at the version they
   actually agreed to).
5. **Waiver signing** — a public, token-scoped flow reachable from the
   existing booking confirmation page: per participant, the guest types a
   legal name and draws a signature (native HTML5 canvas, no new
   dependency), which is recorded with IP/UA/timestamp/version reference.
6. **Waiver status visibility** — on the confirmation page (guest), the
   booking detail page (operator), and the guide manifest (guide,
   day-of).

## 4. Explicitly out of scope

- **Per-tour waiver templates.** `Tour.waiverRequired` stays a boolean
  gate; every tour that requires a waiver uses the *same* one
  workspace-level template. Per-tour template selection is a reasonable
  future enhancement but nothing in `docs/02`/`docs/07` requires it, and
  `Tour.waiverRequired`'s own shape (a flag, not a template reference)
  never committed to it.
- **Forced re-signing on template update.** A participant who signs
  version N stays "signed" even if the operator later publishes version
  N+1. `docs/07`'s "signed document snapshot/version ref" language is
  about preserving what was actually agreed to, not about invalidating
  prior consent — re-prompting existing signers is a policy decision this
  phase does not make.
- **Booking-blocking waivers.** Signing does not gate booking creation or
  confirmation. `Tour.waiverRequired`'s existing (stale) copy already
  described a parallel, after-the-fact flow, and `docs/07`'s own hedge —
  "Tripistic *helps collect and store* waivers; never claim guaranteed
  legal enforceability" — reads as a record-keeping tool, not a hard
  gate. Making it blocking would also force free/instant-confirm bookings
  through a new synchronous step they don't take today.
- **Per-participant magic-link signing.** The lead guest signs for every
  participant from the one confirmation page they already hold via
  `publicToken` (most participants have no email captured at all —
  `BookingParticipant.email` is optional). Individual per-participant
  signing links are a real but separate feature.
- **Real object storage for signature images.** No S3/blob integration
  exists anywhere in this codebase yet (`.env.example`'s `STORAGE_*` vars
  are still "placeholders only," confirmed unchanged since Phase 1). A
  signature is a small PNG (a few KB) stored as a base64 data URL in a
  `text` column — the same pragmatic shortcut `Tour.coverImageUrl` already
  takes (a typed URL, not an upload pipeline). Real object storage is a
  future improvement, not blocked by anything built here.
- **Guide scheduling/availability-conflict detection**, certifications
  expiry reminders, or a guide-facing calendar — the manifest is a
  read-only day-of list, not a scheduling tool.

## 5. Schema changes

Two additive `@@unique` constraints on existing tables (enabling the same
composite-tenant-safe-FK pattern used throughout the booking subtree
since Phase 3):

- `WorkspaceMember` gains `@@unique([workspaceId, id])` — needed so
  `Availability.guide` and `GuideProfile.member` can reference it via
  composite FK.
- `BookingParticipant` gains `@@unique([workspaceId, id])` — needed so
  `WaiverSignature.participant` can do the same.

**`Availability.guideId`** goes from a bare column to a real relation:
```prisma
guide Booking... // (illustrative — see full block below)
```
`onDelete: Restrict`, not `SetNull` — the exact same reasoning Phase 5
already established for `Booking.customer`: a composite FK cannot
`SetNull` when one of its own columns (`workspaceId`) is required/NOT
NULL, because Postgres cannot null out a NOT NULL column. Unlike
`Booking.customer` (where Restrict is nearly always inert, since bookings
are never hard-deleted), this one has a real operational consequence:
`WorkspaceMember` rows genuinely **are** hard-deleted today (member
removal is `prisma.workspaceMember.delete(...)`, confirmed by reading
`app/api/workspaces/[id]/members/[memberId]/route.ts` — there is no
`deletedAt` on `WorkspaceMember` at all). A naive `Restrict` would then
block removing any member who was ever assigned as a guide to *any*
availability, past or future. The fix is not a different `onDelete`
value (Restrict is still the only valid option under Prisma's rule) but
an explicit step in the member-removal route: **clear `guideId` on all of
that member's assignments in the same transaction, before deleting the
member row** — the same "be explicit, don't rely on cascade side effects
for anything meaningful" discipline this codebase has followed since
Phase 3 (see `docs/14_PHASE_3_IMPLEMENTATION_PLAN.md`'s reservation
logic). The existing `member_removed` audit event gains a
`clearedGuideAssignments` count in its metadata rather than a new,
per-availability audit action — removing a prolific guide should not
write dozens of audit rows for one operator action.

**New models:**

- **`GuideProfile`** — `id`, `workspaceId`, `memberId` (composite FK →
  `WorkspaceMember(workspaceId, id)`, `onDelete: Cascade` — pure profile
  metadata, no legal/audit significance to retaining it after a member is
  removed), `certifications` (`String[]`, mirrors `Customer.tags`),
  `notes` (`String?`), timestamps. `@@unique([workspaceId, memberId])` —
  one profile per member, created lazily (upsert) the first time an
  operator adds certifications/notes for someone. Deliberately **not**
  restricted to `role: guide` — an owner who personally guides trips (the
  "Sofia — solo guide" persona in `docs/01`) can have a profile too, and
  the same reasoning applies to assignment (below).

- **`WaiverTemplate`** — `id`, `workspaceId`, timestamps.
  `@@unique([workspaceId])` — a true one-per-workspace singleton,
  get-or-create on first write. Holds no text itself; text lives on
  versions.

- **`WaiverVersion`** — `id`, `workspaceId`, `templateId` (composite FK →
  `WaiverTemplate(workspaceId, id)`, `onDelete: Cascade`), `versionNumber`
  (`Int`, 1-based, increments per template), `title`, `bodyText`
  (`String`, plain text — same simplicity level as `Tour.cancellationPolicy`,
  no rich HTML), `createdById` (`String?` FK → `User`), `createdAt`. No
  `updatedAt` and no update route at all — rows are genuinely immutable
  once created, not merely convention. "The active version" is **derived**
  (`ORDER BY versionNumber DESC LIMIT 1`), never a separate redundant
  `isActive` flag — this codebase consistently prefers derived truth over
  flags that can drift out of sync (booking status is never double-tracked
  either). `@@unique([workspaceId, templateId, versionNumber])`.

- **`WaiverSignature`** — `id`, `workspaceId`, `bookingId` (composite FK →
  `Booking(workspaceId, id)`, `onDelete: Restrict`), `participantId`
  (composite FK → `BookingParticipant(workspaceId, id)`, `onDelete:
  Restrict`), `waiverVersionId` (composite FK →
  `WaiverVersion(workspaceId, id)`, `onDelete: Restrict` — defensive; the
  app itself never deletes versions), `signerName` (the docs' "name" —
  the person who actually held the pen, not necessarily identical to the
  participant's own name, e.g. a parent signing for a minor),
  `signatureImage` (`String`, `data:image/png;base64,...` — the docs'
  "signature"), `signedAt` (the docs' "timestamp"), `ipAddress`,
  `userAgent`, `createdAt`. `@@unique([workspaceId, participantId])` — one
  signature per participant, permanently (see §4 on no forced re-signing).

## 6. Permissions (`lib/auth/permissions.ts`)

- `canManageGuides(role)` — owner/admin only. Delegates to the same role
  set `canManageTours` already uses (owner/admin — tours/schedules/
  availabilities are already owner/admin-only in this codebase, *not*
  staff, unlike bookings/customers), kept as its own named function for
  the same documentation reason `canManageCustomers` is its own function
  even though it delegates to `canManageBookings`. Gates the new
  `/dashboard/guides` page and its routes. Guide **assignment** itself
  (setting `Availability.guideId`) needs no separate check — it travels
  through the existing availability update route, already gated by
  `canManageTours`.
- `canViewGuides(role)` — `canManageGuides(role) || staff || viewer`
  (read-only listing).
- `canManageWaiverTemplate(role)` — owner/admin only. Editing a liability
  document is treated as more sensitive than day-to-day tour editing —
  deliberately not extended to staff.
- `canViewWaiverSignatures(role)` — matches `canViewBookingPII` exactly
  (owner/admin/staff, excludes viewer): a signature image plus IP/UA is
  guest-PII-adjacent, the same sensitivity tier as guest contact info.
- **Guide manifest access is not a role check at all.** Any active member
  (any role) may call the manifest endpoint; it returns exactly the
  availabilities where `guideId` equals *their own* membership id — empty
  for everyone who isn't assigned to anything. This sidesteps a real
  ambiguity in the spec (an owner who guides their own tours is not
  role-`guide`) more correctly than a role gate would, and matches
  `docs/05`'s framing of the capability as "assigned-departures-only,"
  not "role-`guide`-only."
- **Assignment eligibility** (who `Availability.guideId` may point at):
  validated in the service layer, not a `lib/auth/permissions.ts`
  function — the target member must be `status: active` and
  `role !== "viewer"` (a read-only external party, per `docs/01`'s "Ravi
  — accountant/partner (viewer)... external," should never be tour-facing).

## 7. Routes and pages

**Internal:**
- `GET /api/workspaces/[id]/guides` — list members + their `GuideProfile`
  (if any); `canViewGuides`-gated.
- `PATCH /api/workspaces/[id]/guides/[memberId]` — upsert certifications/
  notes; `canManageGuides`-gated.
- `GET /api/workspaces/[id]/manifest` — the caller's own assigned
  departures (see §6); gated only by workspace membership.
- `GET/PUT /api/workspaces/[id]/waiver-template` — get-or-create the
  template + its current version; `PUT` creates a new version;
  `canManageWaiverTemplate`-gated for `PUT`, `canManageWaiverTemplate`
  also for `GET` (the raw legal text and version history are an
  editing surface, not a general read).
- `POST/PATCH /api/workspaces/[id]/tours/[tourId]/availabilities(...)`
  (existing routes, extended) — accept optional `guideId` in the request
  body.
- `GET /api/workspaces/[id]/bookings/[bookingId]` (existing route,
  extended) — response gains a `waiverStatus` array (per participant)
  when the tour requires a waiver; `canViewWaiverSignatures`-gated for the
  signature-bearing fields, same tier as `paymentDetail`.

**Public:**
- `GET /api/public/bookings/[publicToken]/waiver` — current template
  version's text + each participant's signed/unsigned status. 404 if the
  tour does not require a waiver.
- `POST /api/public/bookings/[publicToken]/waiver` — body
  `{ participantId, signerName, signatureImage }`; validates the
  participant belongs to this exact booking, the tour requires a waiver,
  and returns the existing signature idempotently (200, not a 409) if
  that participant already signed — the same "safe to replay" posture
  `createBooking`'s idempotency key and the unsubscribe flow both take.

**Dashboard:**
- `/dashboard/guides` — profile list, certifications/notes editable
  inline for manage-capable roles.
- `/dashboard/manifest` — "My Manifest": the current member's assigned
  upcoming departures as mobile-friendly cards (tour, time, meeting
  point, participant list with per-participant waiver status). Visible to
  every role; shows an empty state for anyone with no assignments.
- `/dashboard/settings` — new "Waiver" `SectionCard` (owner/admin): current
  version's text, a form to publish a new version, version history list.
- `/dashboard/bookings/[bookingId]` — new waiver-status block when the
  tour requires a waiver.

**Public booking pages:**
- `/book/confirmation/[publicToken]` — new "Waiver" section per
  participant when required: signed participants show a checkmark;
  unsigned ones show a "Sign waiver" action opening the name + canvas-
  signature form inline on the same page.

## 8. Testing plan

- **Unit**: signature/version helper logic (e.g. "derive the active
  version," canvas-data-URL shape validation), manifest-filtering pure
  logic if it's extracted separately from the DB query.
- **Integration**:
  - Guide assignment: setting/clearing `guideId` via the availability
    route persists and is tenant-scoped (cross-workspace member id
    rejected); a `viewer`-role member is rejected as an assignment
    target.
  - Manifest: a guide assigned to departure A sees A (with its
    participants) and does not see departure B they are not assigned to,
    even within the same workspace; an unassigned member sees an empty
    list; cross-tenant isolation (a member of workspace X gets nothing
    for an availability in workspace Y even if IDs are guessed).
  - Member removal clears dependent `guideId` references instead of
    failing.
  - Waiver versions: creating a second version does not mutate the first;
    a signature recorded against version 1 keeps pointing at version 1
    after version 2 is published.
  - Waiver signing: a valid signature is recorded with the correct
    participant/booking/version linkage; a duplicate signing attempt for
    an already-signed participant returns the existing record instead of
    creating a second row; signing is rejected for a tour that does not
    require a waiver; a signature for a participant on a *different*
    booking is rejected (tenant/booking scoping).
  - Role enforcement: `canManageGuides`/`canManageWaiverTemplate`
    boundaries (403 for disallowed roles), `canViewWaiverSignatures`
    redaction for `viewer`.

## 9. Security and compliance notes

- Signature capture never claims legal enforceability anywhere in the UI
  copy — matches `docs/07`'s explicit marketing-language constraint.
- IP/UA are captured server-side from the request, the same
  `getRequestContext`-style extraction `recordAuditEvent` already uses —
  never trusted from a client-supplied field.
- The public waiver routes are scoped by the booking's unguessable
  `publicToken`, the same trust model already established for the public
  confirmation page and payment-retry route — no new authentication
  primitive introduced.
- `signatureImage` is validated server-side to actually be a `data:image/png;base64,`-prefixed
  string within a sane size bound (reject anything absurdly large) before
  it is stored — the one new piece of untrusted-input handling this phase
  introduces.

## 10. Stale copy this phase corrects

- `components/tours/tour-form.tsx` — "Waiver required (signing flow
  arrives in Phase 6)" → drops the future-tense framing.
- `app/book/[workspaceSlug]/[tourSlug]/page.tsx` — "You'll be contacted
  with details after booking" → describes the real post-booking signing
  link.
- `app/dashboard/onboarding/page.tsx` — the "Phase 6–7: waivers, guide
  manifests, and the AI Growth Dashboard" bullet, same treatment Phase 5
  gave its own predecessor bullet.
- `app/book/confirmation/[publicToken]/page.tsx` — a bug, not just stale
  copy: this page still reads "Automated confirmation emails aren't
  available yet — this page is your confirmation and receipt," left
  over from before Phase 5 shipped real confirmation emails. Found during
  this phase's repo audit; corrected here since this phase is already
  editing this exact page for the new waiver section.
