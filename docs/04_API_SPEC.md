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

## 3. Future endpoint map (reserved, later phases)

```text
/api/workspaces/:id/tours…                    Phase 2
/api/workspaces/:id/availabilities…           Phase 2
/api/public/:workspaceSlug/tours|availability Phase 3
/api/workspaces/:id/bookings…                 Phase 3
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

## 4. Security requirements (all endpoints)

1. Authenticate first (`requireUser`), then authorize (role/membership), then validate input (zod), then act, then audit.
2. Tenant lookups filter by `workspace_id` from the *verified membership*, never from client-supplied trust.
3. 404 (not 403) for resources outside the caller's tenancy where existence itself is sensitive.
4. Rate limiting + CSRF: NextAuth covers auth CSRF; platform rate limiting is a Phase 11 hardening item (document, don't block MVP).
5. Never echo secrets or internal errors; log server-side instead.
