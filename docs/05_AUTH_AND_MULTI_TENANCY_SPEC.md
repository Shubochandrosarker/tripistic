# Tripistic — Auth & Multi-Tenancy Spec

## 1. Authentication

**Stack:** Auth.js (NextAuth v5) with Credentials provider (email + bcrypt-hashed password), JWT session strategy, httpOnly cookies. Schema keeps `auth_provider_id` so OAuth (Google etc.) can be added without migration pain.

### Flows
- **Register:** `POST /api/auth/register` → zod-validate → lowercase email → uniqueness check → bcrypt hash (cost 12) → create user → audit `user_registered` → client performs credentials sign-in.
- **Login:** NextAuth credentials `authorize()` → find active, non-deleted user by email → bcrypt compare → update `last_login_at` → audit `user_login`. Failures return one generic message.
- **Session:** JWT carries `{ sub: userId, isPlatformAdmin }`. JWT claims are a *hint*; anything security-critical (admin pages/APIs, memberships) re-verifies against the database.
- **Logout:** NextAuth signOut clears cookies.

### Route protection layers (defense in depth)
1. **Middleware** (edge, DB-free `auth.config.ts`): unauthenticated → `/login?callbackUrl=`; authenticated users leave `/login`/`/register`.
2. **Layouts** (server): `/dashboard/**` layout requires session + resolves active workspace; `/admin/**` layout requires `platform_admin` **from the DB**.
3. **APIs**: every handler runs `requireUser()` and its own authorization; never relies on middleware alone.

## 2. Roles

### Platform level
- `platform_admin` — boolean on `users`. Grants `/admin/**` and `/api/admin/**`. Assigned only via seed or DB by the Tripistic team in Phase 1 (no UI to self-grant).

### Workspace level (`workspace_members.role`)
`workspace_owner` · `workspace_admin` · `guide` · `staff` · `viewer`

### Permission matrix (Phase 1 + Phase 2/3 enforcement + future intent)

| Capability | owner | admin | guide | staff | viewer |
|---|---|---|---|---|---|
| View dashboard | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit workspace profile/settings | ✅ | ✅ (non-billing) | ❌ | ❌ | ❌ |
| Manage billing/plan | ✅ | ❌ | ❌ | ❌ | ❌ |
| Invite members | ✅ (any role) | ✅ (guide/staff/viewer/admin*) | ❌ | ❌ | ❌ |
| Change roles / remove members | ✅ (last-owner protected) | limited (below owner/admin) | ❌ | ❌ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage tours/schedules/availability | ✅ | ✅ | ❌ | ✅ | ❌ (read-only) |
| View bookings list/detail | ✅ | ✅ | ❌ | ✅ | ✅ |
| View guest contact info / operator notes on a booking | ✅ | ✅ | ❌ | ✅ | ❌ |
| Create manual booking / change booking status | ✅ | ✅ | ❌ | ✅ | ❌ |
| Customers (CRM, later) | ✅ | ✅ | assigned-only | operate | read-only |

\* admins may invite `workspace_admin` but not `workspace_owner`.

Role helper: `hasRole(member, minimumRole)` uses the ordering `viewer < staff < guide? — no:` roles are **not strictly linear**; Phase 1 uses explicit capability checks: `canManageWorkspace` (owner/admin), `canManageBilling` (owner), `canManageMembers` (owner/admin with sub-rules), `canViewAuditLogs` (owner/admin). Phase 2 added `canManageTours` (owner/admin/staff). Phase 3 added `canManageBookings` (owner/admin/staff), `canViewBookings` (+ viewer), `canViewBookingPII` (excludes viewer) in `lib/auth/permissions.ts`. `guide` has no booking-management access yet — full guide-assignment scoping (assigned-departures-only) is a Phase 6 feature; today a `guide` member gets 403 on booking routes, not partial access.

## 3. Multi-tenancy model

**Shared database + shared schema + `workspace_id` row isolation.** Chosen because it is the cheapest to operate, simplest to migrate, scales well for small/mid SaaS, and naturally supports users in many workspaces (agency model). Schema-per-tenant/db-per-tenant rejected for MVP (operational overhead, migration fan-out) — revisit only for enterprise single-tenant deals.

### Active-workspace resolution
1. `tripistic_active_workspace` httpOnly cookie (set via `POST /api/workspaces/:id/activate`).
2. Server resolves: cookie value → verify **active membership** for session user → else fall back to first membership → else redirect to `/workspaces/new`.
3. The resolved `{ workspace, membership }` pair is the only source of tenant scope — client-supplied workspace ids are always re-verified.

### Isolation rules (non-negotiable)
1. Every tenant table has `workspace_id`; every query includes it, sourced from verified membership.
2. Helpers in `lib/tenancy/workspace.ts` are the single path to tenant scope:
   - `getActiveWorkspace()` — for pages.
   - `requireWorkspaceAccess(workspaceId, capability?)` — for APIs; throws 404/403 semantics.
3. Cross-tenant references rejected in the service layer for Phase 1/2 tables; for the Phase 3 booking subtree, additionally rejected by the database itself via composite `(workspace_id, id)` foreign keys (`docs/03_DATABASE_AND_DATA_MODEL.md` §3).
4. Users see only workspaces they belong to; `platform_admin` uses `/admin` surfaces (and is audited), not tenant UIs.
5. Isolation test (Phase 1 checklist, extended in Phase 2.1/3): user in workspace A calling workspace B's endpoints receives 404/403 and zero data — covered for tours/schedules/availabilities in `tests/integration/tenant-scoping.test.ts` and for bookings in `tests/integration/booking-lifecycle.test.ts` and `tests/integration/booking-routes.test.ts`.
6. **Public booking routes are a deliberate, narrow exception to "authed tenant scope."** They resolve a workspace/tour by public slug (`lib/tenancy/public.ts`) with no session — but still return only public-safe fields (`lib/bookings/serializers.ts`), still re-verify every write against fresh DB state inside the reservation transaction, and still 404 (not 403) any workspace/tour that is inactive, private, or archived, so the exception cannot be used to enumerate or read data outside what the operator explicitly published.

## 4. Invitations

- Token: 32 random bytes hex (`crypto.randomBytes`), unique, single-use, 7-day expiry.
- States: `pending → accepted | revoked | expired` (expiry evaluated at read time and persisted opportunistically).
- Accept requires an authenticated user whose lowercased email equals the invitation email; creates `workspace_members` row with invited role. Existing members: invitation marked accepted idempotently.
- Phase 1 delivers the invite link in the UI (email provider not wired yet — placeholder envs exist); Phase 5 sends real email.

## 5. Audit logging

`lib/audit/audit-log.ts` → `recordAuditEvent({ workspaceId?, userId?, action, entityType?, entityId?, metadata?, request? })` extracts IP (`x-forwarded-for` first hop) + user agent, writes append-only row, and **never throws into the caller path** (logs failure server-side). Phase 1 actions: `user_registered`, `user_login`, `workspace_created`, `workspace_updated`, `member_invited`, `member_invitation_revoked`, `member_joined`, `member_role_changed`, `member_removed`, `settings_updated`, `billing_updated`, `admin_action`.

## 6. Secrets & config

- All secrets via environment (`.env.example` documents keys; no real values committed).
- `AUTH_SECRET` required in production; bcrypt for passwords; no plaintext credentials in code, seed, or logs.
- Optional integrations (Stripe/SMTP/AI/storage) must be absent-safe: the app boots and runs Phase 1 features with none of them set.
