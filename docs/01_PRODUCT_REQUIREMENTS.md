# Tripistic — Product Requirements Document

## 1. Product Vision

Tripistic is the central operating system for independent guides and small tour operators: bookings, payments, availability, guides/staff, waivers, guest communication, CRM, reviews, OTA channels, and AI growth insights in one premium, simple dashboard — flat pricing, 0% commission on direct bookings.

**Product principle** — every feature must answer at least one of:
1. Does it reduce admin time?
2. Does it increase direct bookings?
3. Does it reduce no-shows/cancellations?
4. Does it improve guest experience?
5. Does it help the operator understand what to do next?

## 2. Personas

| Persona | Description | Key jobs-to-be-done |
|---|---|---|
| **Sofia — solo guide** | Runs food walks alone; WhatsApp + spreadsheet; non-technical | Take direct bookings, get paid, look professional, stop admin chaos |
| **Marco — small operator owner** | 4 staff, 6 products, seasonal | Full ops in one tool; know what to improve; manage staff access |
| **Amara — workspace admin/manager** | Runs daily operations for Marco | Bookings, customers, guide assignment — without touching billing |
| **Dev — guide** | Leads assigned trips | See schedule, manifest, guest notes on phone |
| **Lena — staff/support** | Front desk / inbox | Manage bookings, check-ins, guest messages |
| **Ravi — accountant/partner (viewer)** | External | Read-only dashboards and reports |
| **Platform admin (Tripistic team)** | SaaS operator | Manage workspaces, users, plans, audit logs, support |

## 3. Platform Structure

```text
Platform (Tripistic)
└── Workspace / Tour Business  (tenant boundary — workspace_id on every tenant record)
    ├── Members (users × roles: owner, admin, guide, staff, viewer)
    ├── Tours & Availability          (Phase 2)
    ├── Bookings                      (Phase 3)
    ├── Payments                      (Phase 4)
    ├── Customers & Communication     (Phase 5)
    ├── Guides & Waivers              (Phase 6)
    └── AI Growth Insights            (Phase 7+)
```

A user may belong to multiple workspaces (agency model). Platform-level `platform_admin` is a user attribute, not a workspace role.

## 4. Functional Requirements by Module

### 4.1 Accounts & Auth (Phase 1)
- Email/password registration and login (OAuth providers later; schema keeps `auth_provider_id`).
- Session management, logout, last-login tracking.
- Protected routes: `/dashboard/**` requires session; `/admin/**` requires `platform_admin`.
- Safe error messages (no user enumeration beyond standard UX trade-offs, no stack traces).

### 4.2 Workspaces & Membership (Phase 1)
- Create workspace (name, business type, timezone, currency, country) → creator becomes `workspace_owner`; 14-day trial subscription on default plan.
- Switch between workspaces; active workspace persisted and validated server-side.
- Invite members by email with role; invitations expire (7 days), can be revoked; accept flow attaches user to workspace.
- Change member roles / remove members (owner; admins per permission matrix). Last owner cannot be removed/demoted.
- Workspace settings: profile fields + key-value settings store.

### 4.3 Roles & Permissions (Phase 1)
Roles: `platform_admin` (platform), `workspace_owner`, `workspace_admin`, `guide`, `staff`, `viewer` (workspace). Full matrix in `05_AUTH_AND_MULTI_TENANCY_SPEC.md`.

### 4.4 Dashboard (Phase 1 shell)
- Overview: setup progress, onboarding checklist, placeholder metrics (bookings/revenue/departures), AI recommendations placeholder, quick links.
- Honest premium empty states for modules not yet built (tours, bookings, customers, AI growth).
- Settings, billing placeholder, onboarding checklist pages.

### 4.5 Admin Panel (Phase 1 shell)
- Platform overview counts; workspace list; user list; plans list; audit log table. Read-only in Phase 1.

### 4.6 Plans, Subscriptions, Feature Flags (Phase 1 foundation; Phase 10 billing)
- Seeded plans: solo, operator, growth, agency (prices in cents; features + limits JSON).
- Workspace subscription record with `trialing/active/past_due/cancelled/expired` status. No Stripe yet.
- Feature flags resolvable by workspace override → plan default → off.

### 4.7 Audit Logging (Phase 1)
- Helper records: `user_login`, `user_registered`, `workspace_created`, `workspace_updated`, `member_invited`, `member_joined`, `member_role_changed`, `member_removed`, `settings_updated`, `billing_updated`, `admin_action`.
- Log fields: workspace, user, action, entity, metadata, IP, user agent, timestamp.

### 4.8 Later modules (requirements tracked, not built in Phase 1)
- **Tours & availability** (Phase 2): CRUD, capacity, schedules, blackout dates, pricing, add-ons, policies.
- **Booking engine** (Phase 3): public page/widget, calendar, guest/participant forms, statuses, manual booking.
- **Payments** (Phase 4): Stripe intents, deposits, partial payments, refunds records, webhooks.
- **CRM + communication** (Phase 5): profiles, history, notes/tags/consent; email automation.
- **Guides + waivers** (Phase 6): assignment, manifests, mobile view; waiver templates/versions/signatures.
- **AI Growth Dashboard** (Phase 7): rules-based insight engine + LLM narration; insight statuses new/accepted/dismissed/completed.
- **AI booking agent** (Phase 8), **OTA sync** (Phase 9), **SaaS billing** (Phase 10), **hardening** (Phase 11).

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Tenancy** | Shared DB + `workspace_id` isolation; membership verified on every tenant query; cross-tenant access impossible via API or UI |
| **Security** | Env-based secrets, hashed passwords (bcrypt), input validation (zod) on all mutations, role guards, audit logs, safe errors, HTTPS |
| **UX** | Premium SaaS feel (Linear/Stripe/Vercel); responsive; mobile nav; loading/empty/error states everywhere; non-technical-friendly copy |
| **Performance** | Server-rendered dashboard; indexed FKs; no N+1 on lists |
| **Reliability** | App boots without optional integrations (Stripe/AI/SMTP unset); graceful degradation |
| **Accessibility** | Semantic HTML, labels on inputs, focus states, adequate contrast |
| **i18n-readiness** | Copy centralized where practical; currency/timezone stored per workspace from Phase 1 |
| **Auditability** | Sensitive actions logged from Phase 1 |

## 6. Out of Scope (Phase 1 hard exclusions)

Tour CRUD, real bookings, Stripe payment/subscription flows, waiver signing, SMS/WhatsApp, real AI calls, OTA/calendar sync, public marketplace, native mobile apps, advanced analytics, white-label domains.
