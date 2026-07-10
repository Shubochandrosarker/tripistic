# Tripistic — MVP Feature Spec

MVP = Phases 1–7 (foundation → tours → bookings → payments → CRM/comms → guides/waivers → AI Growth Dashboard v1). This spec defines features and acceptance criteria per slice. Phase 1 items are being built now; later items are specified for continuity.

## 1. Phase 1 — SaaS Foundation (NOW)

### 1.1 Auth
- **Register**: name, email, password (≥8 chars) → account created, password bcrypt-hashed, auto-login, `user_registered` audit event.
- **Login**: email + password → session (JWT cookie), `last_login_at` updated, `user_login` audit event. Wrong credentials → generic error.
- **Logout**: session cleared.
- **Route protection**: unauthenticated access to `/dashboard/**` or `/admin/**` redirects to `/login?callbackUrl=…`; authenticated users hitting `/login`/`/register` redirect to `/dashboard`.

### 1.2 Workspaces
- **Create**: form (name, business type, timezone, currency, country) → workspace + unique slug + owner membership + trial subscription (14 days, default plan) + default feature flags + `workspace_created` audit event → redirect to dashboard.
- **First-run**: authenticated user with no workspace is routed to workspace creation.
- **Switch**: switcher lists memberships; selection validated against membership server-side, persisted in httpOnly cookie.
- **Update settings**: owner (and admin for non-billing fields) can edit profile fields; `workspace_updated`/`settings_updated` audit events.

### 1.3 Members & Invitations
- Owner/admin can view members with roles/status.
- Owner/admin can invite email + role (`workspace_admin`, `guide`, `staff`, `viewer`; only owner may grant `workspace_owner`) → pending invitation, 7-day expiry, token link (email delivery stubbed in Phase 1 — link surfaced in UI), `member_invited` audit event.
- Invitee opens `/invite/[token]`: must be logged in with matching email; accept → active membership, `member_joined` audit event. Expired/revoked/mismatched → clear error state.
- Owner can change roles (not their own last-owner role) and remove members; admins cannot manage owners/admins. `member_role_changed` / `member_removed` audit events.

### 1.4 Dashboard shell & pages
- App shell: sidebar (desktop), topbar, mobile nav, workspace switcher, user menu.
- `/dashboard`: workspace header, setup progress %, onboarding checklist card, metric cards (Total Bookings, Revenue, Upcoming Departures — all honest zero/empty), AI recommendation placeholder card, quick links.
- `/dashboard/onboarding`: 7-item checklist (create workspace ✓ auto-detected; others link to placeholder pages).
- `/dashboard/tours` · `/bookings` · `/customers` · `/ai-growth`: premium empty states naming the phase that delivers them, with useful CTA.
- `/dashboard/settings`: workspace profile form (live) + members & invitations management (live) + settings shell.
- `/dashboard/billing`: current plan + trial status from real subscription record; upgrade prompt placeholder; Stripe notice. No payment actions.

### 1.5 Admin shell
- `/admin`: totals (workspaces, users, active/trialing subscriptions) + recent audit logs — real queries.
- `/admin/workspaces` · `/admin/users` · `/admin/plans` · `/admin/audit-logs`: real read-only tables with empty states.
- Access: `platform_admin` only — enforced in layout (DB check) and APIs; non-admins get 404-style denial.

### 1.6 Acceptance (Phase 1 definition of done)
> One user can register, log in, create/select a workspace, see the dashboard, invite a member who joins with the right role, and access only the data/routes allowed by their role. Platform admin can view admin pages. App builds cleanly; `.env.example` exists; migrations + seed run; audit events recorded.

## 2. Phase 2 — Tours & Availability
Tour CRUD (title, description, duration, location, capacity, base price in cents, status draft/active/archived), schedules/recurring availability, blackout dates, add-ons, cancellation policy fields, media placeholders. AC: operator defines a bookable product with future availability slots; all rows workspace-scoped.

## 3. Phase 3 — Booking Engine MVP
Public booking page per workspace slug, calendar availability, guest + participant details, booking statuses (`pending/confirmed/cancelled/completed/no_show`), capacity decrement with overbooking guard, admin manual booking, confirmation screen. AC: end-to-end unpaid booking reduces availability atomically.

## 4. Phase 4 — Stripe Payments
Payment intents, deposits/partial payments, webhook signature verification, refund records, transaction log, payment status sync to bookings. Never store raw card data. AC: paid booking reconciles via webhook; failed payment leaves consistent state.

## 5. Phase 5 — CRM & Communication
Customer profiles (dedup by email per workspace), history, notes/tags, consent status; email templates; automated confirmation + T-24h reminder; review request foundation. AC: booking creates/updates customer; confirmation email sends; consent respected.

## 6. Phase 6 — Guides & Waivers
Guide assignment per departure, daily manifest (mobile-friendly), certifications/notes; waiver templates with immutable versions, signature records (name, signature, timestamp, IP, user agent, participant + booking linkage). AC: guide sees only assigned departures; signed waiver attaches to participant.

## 7. Phase 7 — AI Growth Dashboard v1
Rules-based insight engine over workspace booking/revenue data (occupancy by weekday, underperforming products, direct-vs-OTA share, reminder failures) → insight records (type, title, summary, recommendation, priority, expected impact, status new/accepted/dismissed/completed); LLM narration behind provider abstraction with fallback to template text. AC: insights generate without any AI key configured (rules + templates); no fabricated numbers.

## 8. Cross-cutting rules (all phases)
- Every tenant-owned table carries `workspace_id` (+ index); every query filters by verified membership.
- Monetary values are integer cents + currency code.
- Statuses are enums; soft deletes via `deleted_at` where records have business history.
- Sensitive mutations produce audit events.
- Empty states never fabricate data; sample data must be labeled as sample.
