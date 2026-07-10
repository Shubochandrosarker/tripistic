# Tripistic — Phase 1 Implementation Plan (Final Workflow Instructions)

> Required before coding, per the Master Prompt. This is the definitive workflow for **Phase 1 — SaaS Foundation**.

## 1. Existing repo audit

| Item | Finding |
|---|---|
| Framework | **None — repository contains documentation only** (12 strategy MD files, LICENSE, README, Master Prompt). No `package.json`, no source code, no lockfile, no CI. |
| Package manager | None yet → **npm** (no competing lockfiles). |
| Database/ORM | None yet. |
| Auth system | None yet. |
| UI framework | None yet. |
| Existing routes/components | None. |
| Environment structure | No `.env*` files. |
| Build commands | None. |
| Existing errors/missing deps | N/A — greenfield. Nothing existing can break; nothing is duplicated. |

**Consequence:** Phase 1 scaffolds the application from scratch at the repo root. Existing MD strategy files are preserved untouched.

## 2. Detected/chosen stack

Per `08_Technical_Architecture.md` (React/Next.js frontend, Node backend, PostgreSQL) and the Master Prompt's recommended Next.js structure:

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Single deployable for dashboard + API foundation; server components fit a data-heavy SaaS; matches prompt's recommended structure |
| Styling | **Tailwind CSS v4** | Premium SaaS look (Linear/Stripe/Vercel patterns) with small surface; dark/light ready via `prefers-color-scheme` |
| Fonts/icons | Geist (local package, no build-time network) + lucide-react | Premium, zero external font fetch |
| Database | **PostgreSQL** | Per architecture doc |
| ORM/migrations | **Prisma 6** (checked-in SQL migrations + typed client) | Fast to evolve through Phases 2–10 |
| Auth | **Auth.js / NextAuth v5**, Credentials provider, JWT sessions, bcryptjs | Standard for App Router; CSRF handled; OAuth providers can be added later |
| Validation | zod | All API inputs |
| Deployment shape | `app.tripistic.com` (this app) + `api.tripistic.com` later; marketing site separate | Per Master Prompt architecture assumption |

## 3. Folder structure (target)

```text
app/
  (auth)/login, (auth)/register            # public auth pages
  (marketing)/page.tsx                     # minimal landing → login/register
  invite/[token]/                          # invitation acceptance
  workspaces/new/                          # create workspace (first-run + switcher)
  dashboard/{layout,page} + onboarding|bookings|tours|customers|ai-growth|settings|billing/
  admin/{layout,page} + workspaces|users|plans|audit-logs/
  api/auth/[...nextauth], api/auth/register
  api/me, api/session, api/plans, api/audit-logs
  api/workspaces (+ [id]: activate, members/[memberId], invitations/[invitationId], settings)
  api/invitations/[token]/accept
  api/admin/{workspaces,users,plans,audit-logs}
components/
  app/    app-shell, sidebar-nav, topbar, workspace-switcher, mobile-nav, user-menu
  dashboard/ metric-card, setup-checklist, ai-recommendation-card, upgrade-prompt
  settings/  members management client components
  ui/     page-header, empty-state, status-badge, role-badge, loading-state,
          error-state, table-shell, section-card, confirm-dialog, button, input, card
lib/
  auth/   config split (edge-safe auth.config + full auth), session helpers, guards, passwords
  tenancy/workspace.ts (active workspace + access checks)
  audit/  audit-log.ts
  plans/  limits.ts (flag/limit resolution)
  db.ts, validation.ts, utils.ts, constants.ts
prisma/  schema.prisma, migrations/, seed.ts
middleware.ts, .env.example, docs/
```

## 4. Database approach

- Shared DB + `workspace_id` isolation (see `docs/03` + `docs/05`).
- Phase 1 tables: `users`, `workspaces`, `workspace_members`, `invitations`, `audit_logs`, `settings`, `plans`, `subscriptions`, `feature_flags` — with enums for statuses/roles/business types, timestamps everywhere, `deleted_at` on users/workspaces.
- Initial migration generated from the Prisma schema and checked in; applied via `prisma migrate deploy`.
- Seed: 4 plans (solo $19/$190, operator $69/$690, growth $99/$990, agency $199/$1990 — cents) + plan-default feature flags + **optional** platform admin from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (no hardcoded credentials).

## 5. Auth approach

NextAuth v5 credentials + JWT cookies; register endpoint hashes with bcrypt; middleware handles redirects (edge-safe config without Prisma); server layouts and API handlers re-verify against DB. Details in `docs/05`.

## 6. Workspace / multi-tenancy approach

Active workspace = httpOnly cookie validated against membership on every server read; helpers in `lib/tenancy` are the single tenancy path; client-supplied workspace ids always re-verified; out-of-tenant → 404. First-run redirect to `/workspaces/new`.

## 7. Role system

`platform_admin` (user flag, DB-verified for every admin surface) + workspace roles `workspace_owner/workspace_admin/guide/staff/viewer` with capability checks (`canManageWorkspace`, `canManageBilling`, `canManageMembers`, `canViewAuditLogs`) and last-owner protection. Matrix in `docs/05` §2.

## 8. Routes/pages to create

Dashboard: `/dashboard`, `/dashboard/onboarding`, `/dashboard/bookings`, `/dashboard/tours`, `/dashboard/customers`, `/dashboard/ai-growth`, `/dashboard/settings`, `/dashboard/billing` — live shell + honest premium empty states naming the delivering phase.
Admin: `/admin`, `/admin/workspaces`, `/admin/users`, `/admin/plans`, `/admin/audit-logs` — real read-only queries.
Auth/flow: `/login`, `/register`, `/workspaces/new`, `/invite/[token]`, minimal `/` landing.

## 9. Components to create

`AppShell, SidebarNav, Topbar, WorkspaceSwitcher, MobileNav, PageHeader, MetricCard, EmptyState, StatusBadge, RoleBadge, UpgradePrompt, SetupChecklist, AIRecommendationCard, LoadingState, ErrorState, ConfirmDialog, TableShell, SectionCard` + primitives (Button, Input, Card, Select).

## 10. Models/tables to create

The nine Phase 1 tables in §4 (full column spec in `docs/03`). No Phase 2+ tables.

## 11. API plan

Phase 1 endpoints exactly as specified in `docs/04` §2: auth/register + NextAuth, me/session, workspaces CRUD + activate, members PATCH/DELETE, invitations POST/GET/DELETE + accept, settings GET/PATCH, audit-logs GET/POST, plans GET, admin GETs. Pattern per handler: authenticate → authorize (membership/role) → zod-validate → act → audit → safe response.

## 12. Security plan

Env-only secrets (`.env.example` placeholders), bcrypt, protected routes (middleware + layout + API), DB-verified admin, tenancy helpers, allow-listed settings keys, enum-validated roles, generic error bodies, append-only audit log via non-throwing helper, invitation token hygiene, last-owner protection. Full list in `docs/07` §5.

## 13. Build order (execution workflow)

1. **Repo audit** — done (§1).
2. **Docs** — `docs/00–08` + this plan — done before coding, per hard rule.
3. **Database foundation** — Prisma schema, initial migration, seed; verify against local Postgres 16.
4. **Auth + roles** — NextAuth config split, register endpoint, session/guard/tenancy/audit helpers, middleware.
5. **Dashboard shell** — AppShell, sidebar, topbar, workspace switcher, layouts.
6. **Dashboard pages** — the 8 routes with live data where real (workspace, subscription, members) and premium empty states elsewhere.
7. **Admin shell** — the 5 admin routes, DB-verified admin gate, read-only tables.
8. **Components** — reusable UI kit as listed.
9. **Environment file** — `.env.example` with all placeholder keys (no secrets).
10. **Testing + report** — `npm install` / `lint` / `build`; migrate + seed against local Postgres; tenancy checks; then `docs/10_PHASE_1_COMPLETION_REPORT.md`, README update, commit/push/draft PR. **Stop — no Phase 2.**

## 14. Risks

| Risk | Mitigation |
|---|---|
| NextAuth v5 is a beta line | Pinned version; config-split pattern is the documented standard; swappable behind `lib/auth` helpers |
| No email provider yet → invites can't be emailed | Invite links surfaced in UI for owner to share; email lands in Phase 5; envs reserved |
| Build without a live DB (CI) | No DB access at build time: dashboard pages are request-time rendered; build verified with placeholder env |
| JWT role staleness (admin revoked but token alive) | Admin surfaces re-check DB on every request |
| Trial/billing placeholders drift from real billing later | Single `subscriptions` read path; Stripe fields already modeled |
| Scope creep into Phase 2 | Hard exclusion list in `docs/01` §6; empty states instead of features |

## 15. Testing checklist (gate for completion report)

- [ ] `npm install`, `npm run lint`, `npm run build` pass
- [ ] `prisma migrate deploy` + `prisma db seed` succeed on Postgres 16
- [ ] Register → login → create workspace → dashboard renders; roles saved correctly
- [ ] Logged-out `/dashboard` and `/admin` redirect to login
- [ ] Non-admin `/admin` denied; platform admin allowed
- [ ] Workspace-A member calling workspace-B APIs gets 404/403, zero data
- [ ] Empty states render on tours/bookings/customers/ai-growth; settings + billing pages load
- [ ] `.env.example` exists, contains no real secrets; app boots with optional integrations unset
- [ ] Audit rows written for register/login/workspace_created/member_invited/role_changed/settings_updated
