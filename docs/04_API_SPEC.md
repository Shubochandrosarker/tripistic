# Tripistic — API Spec

**Style:** REST, JSON, Next.js route handlers under `/api`. **Auth:** session cookie (NextAuth JWT). **Validation:** zod on every mutation. **Errors:** `{ "error": string }` with proper status; no stack traces or internals. **Tenancy:** workspace-scoped routes verify membership + role before touching data. Sensitive mutations write audit events.

## 1. Conventions

- `200/201` success · `400` validation · `401` unauthenticated · `403` forbidden (or `404` to avoid resource enumeration on admin/tenant lookups) · `404` not found · `409` conflict · `500` generic.
- List endpoints support `?limit=` (default 50, max 100) and are ordered newest-first unless noted.
- All ids are opaque strings (cuid).

## 2. Phase 1 endpoints (implemented now)

### Auth / session
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | public | {name, email, password} → creates user, audit `user_registered`. Auto sign-in performed client-side after. |
| GET/POST | `/api/auth/[...nextauth]` | public | NextAuth (credentials sign-in, session, CSRF, sign-out) |
| GET | `/api/me` | authed | current user + memberships (workspace id/name/slug/role) |
| GET | `/api/session` | authed | lightweight session echo (user id, email, isPlatformAdmin, activeWorkspaceId) |

### Workspaces
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/workspaces` | authed | workspaces the caller belongs to |
| POST | `/api/workspaces` | authed | {name, businessType, timezone, currency, country} → workspace + owner membership + trial subscription + flags; audit `workspace_created` |
| GET | `/api/workspaces/:id` | member | workspace profile + caller's role |
| PATCH | `/api/workspaces/:id` | owner (admin: non-billing profile fields) | audit `workspace_updated` |
| POST | `/api/workspaces/:id/activate` | member | sets active-workspace httpOnly cookie |

### Members & invitations
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/workspaces/:id/members` | member | members with user info + roles |
| PATCH | `/api/workspaces/:id/members/:memberId` | owner (admin limited) | {role} — last-owner protected; audit `member_role_changed` |
| DELETE | `/api/workspaces/:id/members/:memberId` | owner (admin: guide/staff/viewer only); self-removal allowed except last owner | audit `member_removed` |
| GET | `/api/workspaces/:id/invitations` | owner/admin | pending invitations |
| POST | `/api/workspaces/:id/invitations` | owner/admin (owner only for owner-role invites) | {email, role} → token link (email send stubbed Phase 1); audit `member_invited` |
| DELETE | `/api/workspaces/:id/invitations/:invitationId` | owner/admin | revoke; audit `member_invitation_revoked` |
| POST | `/api/invitations/:token/accept` | authed, email must match | membership created; audit `member_joined` |

### Settings
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/workspaces/:id/settings` | member | key-value settings |
| PATCH | `/api/workspaces/:id/settings` | owner/admin | upserts allow-listed keys; audit `settings_updated` |

### Audit logs / plans
| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/audit-logs?workspaceId=` | owner/admin of that workspace | workspace-scoped log |
| POST | `/api/audit-logs` | owner/admin | manual note-style event from allow-listed action set; source tagged `api` |
| GET | `/api/plans` | public | active plans (pricing page use) |

### Admin (platform_admin only — verified against DB, not just JWT)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/workspaces` | all workspaces + owner + plan + status |
| GET | `/api/admin/users` | all users + membership counts |
| GET | `/api/admin/plans` | all plans incl. inactive |
| GET | `/api/admin/audit-logs` | platform-wide log |

## 3. Phase 2 endpoints (implemented — tours & availability)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET/POST | `/api/workspaces/:id/tours` | member / owner-admin-staff | list / create |
| GET/PATCH/DELETE | `/api/workspaces/:id/tours/:tourId` | member / owner-admin-staff | status→archived routes through the canonical `archiveTour()` service; 409 if the tour has active future bookings (Phase 3) |
| GET/POST | `/api/workspaces/:id/tours/:tourId/addons` | member / owner-admin-staff | |
| PATCH/DELETE | `/api/workspaces/:id/tours/:tourId/addons/:addonId` | owner-admin-staff | |
| GET/POST | `/api/workspaces/:id/tours/:tourId/schedules` | member / owner-admin-staff | POST creates the schedule and generates its slots in one transaction |
| PATCH/DELETE | `/api/workspaces/:id/tours/:tourId/schedules/:scheduleId` | owner-admin-staff | |
| POST | `/api/workspaces/:id/tours/:tourId/schedules/:scheduleId/generate` | owner-admin-staff | regenerates future slots; 409 if the tour is archived |
| GET | `/api/workspaces/:id/tours/:tourId/availabilities` | member | strict date-range query validation (max 365 days) |
| PATCH/DELETE | `/api/workspaces/:id/tours/:tourId/availabilities/:availabilityId` | owner-admin-staff | PATCH rejects `capacity < bookedCount`; DELETE rejects (409) if the slot has active bookings (Phase 3) |
| GET/POST | `/api/workspaces/:id/blackout-dates` | member / owner-admin-staff | |
| PATCH/DELETE | `/api/workspaces/:id/blackout-dates/:blackoutId` | owner-admin-staff | |

## 4. Phase 3 endpoints (implemented — booking engine)

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/public/:workspaceSlug/tours` | public, no auth | active/public tours only; 404 for a paused/private/nonexistent workspace |
| GET | `/api/public/:workspaceSlug/tours/:tourSlug` | public, no auth | tour detail; 404 for private/archived |
| GET | `/api/public/:workspaceSlug/tours/:tourSlug/availability` | public, no auth | upcoming departures + seats remaining; never returns `bookedCount`/internal ids |
| POST | `/api/public/:workspaceSlug/bookings` | public, no auth | honeypot field + 50 KB body cap; atomic seat reservation; idempotent via client-supplied `idempotencyKey`; audit `booking_created` |
| GET | `/api/public/bookings/:publicToken` | public, no auth | confirmation lookup by opaque token only — no email/phone/internal id required or returned |
| GET/POST | `/api/workspaces/:id/bookings` | owner-admin-staff-viewer (list) / owner-admin-staff (create) | list: pagination, status/date/search filters, status summary; POST: manual booking through the same canonical `createBooking()` service as the public path; audit `booking_created_manual` |
| GET/PATCH | `/api/workspaces/:id/bookings/:bookingId` | owner-admin-staff-viewer (GET, PII gated) / owner-admin-staff (PATCH) | PATCH is limited to non-reservation fields (notes, contact info) — departure, price, and participant count are not editable outside the reservation service; audit `booking_updated` |
| POST | `/api/workspaces/:id/bookings/:bookingId/status` | owner-admin-staff | state-machine-enforced transition; releases capacity exactly once on cancellation; audit `booking_confirmed`/`booking_cancelled`/`booking_completed`/`booking_marked_no_show` |

## 5. Future endpoint map (reserved, later phases)

```text
/api/integrations/stripe/webhook              Phase 4
/api/workspaces/:id/customers…                Phase 5
/api/workspaces/:id/messages…                 Phase 5
/api/workspaces/:id/guides|manifests…         Phase 6
/api/workspaces/:id/waivers…                  Phase 6
/api/workspaces/:id/ai/insights…              Phase 7
/api/ai/booking-agent…                        Phase 8
/api/integrations/(viator|gyg|google-tt)…     Phase 9
/api/billing/(checkout|portal|webhook)…       Phase 10
```

Versioning: URL stays unversioned inside the app; when the public/partner API ships (agent-commerce readiness), expose `api.tripistic.com/v1/**` with the same resource shapes.

## 6. Security requirements (all endpoints)

1. Authenticate first (`requireUser`), then authorize (role/membership), then validate input (zod), then act, then audit.
2. Tenant lookups filter by `workspace_id` from the *verified membership*, never from client-supplied trust. Public booking routes resolve workspace/tour by slug via `lib/tenancy/public.ts` and re-verify every write inside the reservation transaction — never trusting ids the client sent earlier in the flow.
3. 404 (not 403) for resources outside the caller's tenancy where existence itself is sensitive; the same 404-not-403 rule applies to public routes for any paused/private/archived/nonexistent workspace or tour.
4. Rate limiting + CSRF: NextAuth covers auth CSRF; the public booking endpoint has a honeypot field and a request-body size cap; platform-wide rate limiting is still a Phase 11 hardening item (document, don't block MVP) — see `README.md`'s deployment recommendations for an edge/proxy-level stopgap.
5. Never echo secrets or internal errors; log server-side instead.
6. Public responses use a dedicated serializer (`lib/bookings/serializers.ts`) that never includes guest email/phone, operator notes, or internal database ids — only the opaque `publicToken` and booking reference identify a booking outside its tenant.
