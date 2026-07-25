# Tripistic v2.0.0 Architecture

## Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- PostgreSQL
- Prisma 6
- Auth.js / NextAuth v5
- Stripe
- zod
- Vitest and Playwright

## Application Surfaces

- `/` marketing and product entry.
- `/login`, `/register`, `/invite/*` authentication and invitation flows.
- `/dashboard/*` authenticated operator workspace OS.
- `/admin/*` platform-admin-only control plane.
- `/book/*`, `/embed/*`, `/itinerary/*` public guest surfaces.
- `/api/workspaces/*` tenant-scoped operator APIs.
- `/api/public/*` public booking and itinerary APIs.
- `/api/admin/*` platform control-plane APIs.

## Tenant Model

Tripistic uses a shared database with row-level workspace tenancy:

- `Workspace` is the tenant.
- `WorkspaceMember` grants a user one role in one workspace.
- Tenant-owned records carry `workspaceId`.
- `requireWorkspaceAccess(userId, workspaceId)` verifies active membership.
- Public booking routes resolve workspace context by active slug.

## RBAC Model

Roles:

- `workspace_owner`
- `workspace_admin`
- `guide`
- `staff`
- `viewer`
- `platform_admin` via `User.isPlatformAdmin`

Capabilities live in `lib/auth/permissions.ts`. This is intentionally explicit, so PII, billing, tours, bookings, CRM, guides, operations, vendors, and itineraries can evolve independently.

## Data Domains

Core platform:
- Users, workspaces, memberships, invitations, settings, plans, subscriptions, audit logs.

Booking engine:
- Tours, add-ons, schedules, availabilities, blackout dates, bookings, participants, add-on snapshots, status events.

Payments:
- Payments and payment events.

CRM and messaging:
- Customers, companies, leads, tasks, activities, messages.

Operations:
- Guide profiles, waiver templates/versions/signatures, staff time, ratings, vehicles, operations events, incidents, vendors, invoices.

AI itinerary:
- Itineraries, days, items, immutable versions.

v2 enterprise:
- White labels, custom domains, AI provider configs, maintenance settings.

## v2 Runtime Additions

Theme engine:
- `ThemeScript` applies the saved theme before first paint.
- `ThemeProvider` persists `light`, `dark`, or `system` to localStorage and cookie.
- CSS variables are driven by `html[data-theme]` with system fallback.

Command palette:
- `CommandPalette` opens with Ctrl/Command K.
- Built-in commands route to key modules and AI workflows.
- Workspace results are served by `GET /api/workspaces/[id]/search` with RBAC-aware search across bookings, customers, tours, and itineraries.

Super admin:
- Expanded nav covers organizations, users, plans, licenses, revenue, domains, white labels, AI providers, system health, audit logs, and maintenance.

White label and domains:
- Data model supports brand kits, public/API brand identity, DNS verification, SSL state, and health check metadata.

## Operational Boundaries

Must be completed before enterprise production:
- Middleware for maintenance mode.
- Hostname-to-workspace custom-domain resolver.
- DNS and TLS verification worker.
- Stripe SaaS subscription synchronization.
- WAF/CDN rate limiting.
- CSP and security headers.
- Accessibility, responsive, and Lighthouse CI gates.
