# Tripistic v2.0.0 Repository Audit

Date: 2026-07-25

## Executive Summary

Tripistic is a mature Next.js 15 SaaS codebase with a shared PostgreSQL database, Prisma migrations, Auth.js credentials auth, tenant-scoped workspace access, Stripe payment automation, CRM, operations, fleet, vendor, waiver, itinerary, and platform-admin modules. The repository currently contains 95 API route files, 137 exported route handlers, 39 dashboard/admin pages, 38 test files, and 11 Prisma migrations.

v2.0.0 adds the enterprise foundation for persisted theme modes, global command/search, white-label records, custom-domain records, AI provider configuration, maintenance state, and expanded super-admin surfaces.

## Architecture

Strengths:
- Next.js App Router keeps public booking, operator dashboard, admin, and API surfaces clearly separated.
- `lib/tenancy/workspace.ts` centralizes tenant membership resolution.
- Business logic lives in focused `lib/*/service.ts` modules instead of being entirely embedded in route handlers.
- Prisma schema uses `workspace_id` across tenant-owned records and composite tenant-safe foreign keys on the booking/payment/itinerary subtree.

Risks:
- Some newer enterprise capabilities are now data-model and admin-readiness scaffolds, but need runtime enforcement in middleware and public renderers.
- Admin actions are partly read-only; write flows for white-label and custom-domain provisioning should be added before launch.

## Database

Strengths:
- PostgreSQL with hand-written migrations for constraints Prisma cannot express.
- Booking capacity is enforced atomically with SQL updates plus database constraints.
- Append-only audit, payment event, booking status, waiver version, itinerary version, and operations event histories preserve forensic context.

v2 additions:
- `workspace_white_labels`
- `custom_domains`
- `ai_provider_configs`
- `maintenance_settings`
- Enums for white-label, domain, and AI provider status.

Risks:
- Domain verification currently records state but does not yet perform DNS/TLS checks.
- Maintenance state exists but requires middleware enforcement to block non-admin traffic.

## Authentication

Strengths:
- Auth.js / NextAuth v5 credentials auth with bcrypt password hashing.
- Active user lookup is re-verified against the database.
- Platform admin page/API guards re-check `isPlatformAdmin` on each request.

Risks:
- No MFA or SSO yet.
- Password reset/email verification flows are not visible in the current repository.

## RBAC

Strengths:
- `lib/auth/permissions.ts` defines explicit capability checks rather than a vague role hierarchy.
- Last-owner protection exists for workspace membership changes.
- View permissions separate PII-bearing access from redacted access.

Risks:
- New v2 white-label/domain builder write permissions should be attached to owner/admin roles when operator-facing UI is added.

## Multi-Tenancy

Strengths:
- Tenant records carry `workspaceId`.
- API access is routed through `requireWorkspaceAccess`.
- Public routes resolve active workspaces by slug rather than trusting workspace IDs.

Risks:
- A future custom-domain resolver must map hostnames to active `CustomDomain` records and workspace context before public booking rendering.

## APIs

Strengths:
- Route handlers consistently use `handleApiError`, zod validation, and auth/tenancy guards.
- Stripe webhook processing uses raw request body verification.
- Public booking APIs use idempotency and capacity reservation.

v2 additions:
- `GET /api/workspaces/[id]/search`
- `GET /api/admin/domains`
- `GET /api/admin/white-labels`
- `GET /api/admin/ai-providers`
- `GET/PATCH /api/admin/maintenance`

Risks:
- Rate limiting is still delegated to infrastructure.
- API versioning is not yet formalized.

## Stripe

Strengths:
- Checkout Sessions are created server-side.
- Signed webhook processing is the source of payment truth.
- Pending payment expiration releases capacity.
- Payment events are append-only and idempotent.

Risks:
- SaaS billing metrics currently derive from local plan/subscription rows. Stripe subscription sync and Connect payouts are not complete.

## Booking Engine

Strengths:
- Atomic capacity reservation prevents oversells.
- Public booking creation is idempotent.
- Confirmation pages use high-entropy public tokens.
- Manual bookings and status transitions exist.

Risks:
- Abuse controls should be enforced at the CDN/WAF layer before public launch.

## Performance

Strengths:
- Sidebar prefetching is disabled to reduce RSC request bursts.
- Server pages batch data with `Promise.all`.
- App uses Tailwind variables and simple server-rendered layouts.

Risks:
- Lighthouse 95+ must be verified after production build with real assets.
- Some admin pages query up to 100 rows; deeper pagination should be added as data grows.

## Security

Strengths:
- Tenant isolation through application guards and database keys.
- zod validation on API inputs.
- Prisma parameterization reduces SQL injection exposure.
- Raw SQL usage is limited to controlled service functions and template-tagged Prisma calls.
- Audit logs are used for sensitive actions.
- Production dependency audit is clean after v2 dependency upgrades and overrides:
  `npm audit --omit=dev` reports 0 vulnerabilities.

Gaps:
- No in-app distributed rate limiting.
- No CSP/security headers policy was found.
- CSRF posture depends on same-site cookies, server actions, and route design; high-risk state-changing APIs should add explicit CSRF tokens or origin checks.
- Full XSS hardening should add CSP and sanitize any future rich-text/HTML inputs.

## Tests

Coverage present:
- Unit tests for booking references, serializers, status, messaging templates, payments, validation, webhook idempotency.
- Integration tests for booking lifecycle/concurrency/routes, tenant scoping, payments, CRM, guides, waivers, operations, vehicles, vendors, itineraries.
- Playwright tests for booking, guides/waivers, and waiver signing.

Gaps:
- Accessibility and responsive test suites are not yet explicit.
- v2 theme, command palette, admin enterprise pages, white-label, and domain flows need new tests.

## Technical Debt

Priority items:
1. Add middleware enforcement for `maintenance_settings`.
2. Add custom-domain host resolver and DNS/TLS checker worker.
3. Add operator-facing white-label/domain builder with owner/admin permissions.
4. Add CSP, security headers, CSRF/origin checks, and production rate limits.
5. Add SaaS billing sync from Stripe subscriptions.
6. Add a11y/responsive Playwright coverage and Lighthouse CI.
