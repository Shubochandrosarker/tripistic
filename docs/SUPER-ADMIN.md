# Tripistic v2.0.0 Super Admin

## Access

Super Admin is available at `/admin` and guarded by `requirePlatformAdminPage()`.

API routes under `/api/admin/*` use `requirePlatformAdminApi()`.

Both re-check the active database user and `isPlatformAdmin` instead of trusting only JWT claims.

## Navigation

The v2 admin control plane includes:

- Overview
- Organizations
- Users
- Plans
- Revenue
- Licenses
- Domains
- White Labels
- AI Providers
- System Health
- Audit logs
- Maintenance

## Pages

`/admin/revenue`
- MRR, ARR, guest payment volume, active subscriptions, plan mix.

`/admin/licenses`
- Active seats, suspended seats, organization plan limits.

`/admin/domains`
- Hostnames, verification status, expected CNAME, health message.

`/admin/white-labels`
- Brand kits and coverage for login, email, PDF, public pages, API identity.

`/admin/ai-providers`
- Provider registry and environment readiness.

`/admin/system-health`
- Tenant count, message queue state, payment queue state, maintenance state, recent logs.

`/admin/maintenance`
- Database-backed maintenance mode switch and public message.

## APIs

- `GET /api/admin/domains`
- `GET /api/admin/white-labels`
- `GET /api/admin/ai-providers`
- `GET /api/admin/maintenance`
- `PATCH /api/admin/maintenance`

## Next Production Steps

1. Add admin write workflows for domains and white-label records.
2. Enforce maintenance state in middleware.
3. Add background checks for DNS, SSL, queues, and webhooks.
4. Add admin audit-log writes for every super-admin mutation.
5. Add pagination and CSV exports for revenue and license reports.
