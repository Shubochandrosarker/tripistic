# Public Launch Phase 4 Progress

Date: 2026-07-27

## Completed in this checkpoint

- Added provider state fields to `custom_domains`: provider, provider hostname ID, provider status, provider SSL status, provider DCV records, provider errors, redirect target metadata, and cache invalidation timestamp.
- Added custom-domain operations migration `20260727143000_custom_domain_operations`.
- Added Cloudflare provider fields migration `20260727152000_cloudflare_domain_provider`.
- Added edge-safe hostname normalization and reserved-platform-host handling.
- Added server-side custom-domain validation rejecting malformed hosts, IPs, localhost, and Tripistic-owned hosts.
- Added plan entitlement enforcement for `custom_domains`.
- Added DNS TXT and CNAME verification helpers.
- Added real Cloudflare SaaS Custom Hostnames adapter with create/get/delete, provider hostname status, provider SSL status, TXT DCV, HTTP DCV, and provider error persistence.
- Added owner/admin domain APIs for list, create, verify, activate, and disable.
- Added protected scheduled polling endpoint at `POST /api/admin/domains/poll`.
- Added protected internal hostname cache endpoint at `GET /api/internal/host-cache`.
- Added `/dashboard/domains` operator UI with exact CNAME/TXT records, Cloudflare DCV records, verification, activation, removal, apex redirect option, and health history.
- Added middleware host routing:
  - reserved platform hosts continue to app/admin/marketing routes;
  - `{workspaceSlug}.tripistic.com` rewrites to `/book/:workspaceSlug`;
  - candidate custom domains resolve through a short-lived internal host cache and fall back to a DB-backed `_host` resolver;
  - apex domains with `redirect_to` issue a 308 redirect to the configured `www` hostname.
- Added active custom-domain storefront rendering for `/` and `/tours/:tourSlug`.
- Added PostgreSQL integration coverage for Cloudflare custom hostname provisioning, DNS/provider fixtures, polling, provider TLS activation, and apex-to-www resolution.
- Added Playwright fixture coverage for active custom-domain host rendering.
- Updated `docs/CUSTOM-DOMAINS.md` and `.env.example`.

## Verification

| Command | Result |
| --- | --- |
| `cmd /c npx prisma format` | Passed |
| `cmd /c npm run db:generate` | Passed |
| `cmd /c "set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripistic_test&& npx prisma validate"` | Passed |
| `cmd /c npm run test:unit` | Passed: 20 files, 107 tests |
| `cmd /c npm run lint` | Passed |
| `cmd /c npm run typecheck` | Passed |
| `cmd /c npm run build` | Passed; still logs known Prisma `DATABASE_URL` warnings during static generation in this environment |
| `cmd /c npm run test:integration` | Blocked: `DATABASE_URL is not set (expected from .env.test or the CI environment)` |
| `cmd /c npm run test:e2e` | Blocked: `DATABASE_URL is not set (expected from .env.test or the CI environment)` |
| `git status --short` | Blocked: this extracted workspace is not a Git repository |

## External Configuration Required

- Set `ROOT_DOMAIN` and `NEXT_PUBLIC_ROOT_DOMAIN` to the production root domain.
- Set `RESERVED_PLATFORM_HOSTS` for every operational subdomain that must never resolve as a tenant storefront.
- Set `CUSTOM_DOMAIN_CNAME_TARGET` to the actual edge hostname customers should CNAME to.
- Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` for Cloudflare for SaaS Custom Hostnames. Without both, the app stays in manual provider mode.
- Set `DOMAIN_CRON_SECRET` or `CRON_SECRET` and schedule `POST /api/admin/domains/poll`.
- Set `HOSTNAME_CACHE_SECRET` or `CRON_SECRET` so middleware can resolve cached host mappings through the internal endpoint.

## Still Requires Runtime Proof

- Real Cloudflare production proof requires valid Cloudflare zone credentials and a delegated customer DNS hostname.
- Scheduled polling is implemented as a protected endpoint; production deployment still needs the external scheduler/cron trigger configured.
- The edge hostname map is an in-process short TTL cache backed by an internal endpoint, not Cloudflare KV, Durable Object, or globally replicated edge storage.
- Local integration/e2e execution requires a PostgreSQL `tripistic_test` database.
