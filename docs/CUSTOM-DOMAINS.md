# Tripistic v2.0.0 Custom Domains

## Goal

Custom domains let operators serve public booking and itinerary experiences from their own hostname.

## Data Model

Table: `custom_domains`

Fields:

- `workspace_id`
- `hostname`
- `status`
- `verification_token`
- `expected_cname`
- `provider`
- `provider_hostname_id`
- `provider_status`
- `provider_ssl_status`
- `provider_errors`
- `provider_txt_name`
- `provider_txt_value`
- `provider_http_url`
- `provider_http_body`
- `redirect_to`
- `cache_invalidated_at`
- `verified_at`
- `ssl_issued_at`
- `last_checked_at`
- `last_check_message`

Statuses:

- `pending_dns`
- `verifying`
- `verified`
- `ssl_pending`
- `active`
- `failed`
- `disabled`

## DNS Contract

Each non-apex domain should provide:

- CNAME to the Tripistic edge hostname.
- TXT verification token proving domain ownership.
- Cloudflare ownership TXT or HTTP DCV record when Cloudflare provider mode is enabled.

The expected CNAME is stored per row so future infrastructure can support region-specific targets.

Apex hostnames are accepted when the workspace enables redirect-to-www. Because DNS CNAMEs are not valid at most apex zones, Tripistic requires the ownership TXT plus provider hostname/TLS health for the apex row, then redirects apex traffic to `www.<domain>`.

## Health Checks

Required checks:

- DNS CNAME lookup for non-apex hostnames.
- TXT ownership lookup.
- Cloudflare custom hostname status when provider credentials are configured.
- Cloudflare SSL certificate status when provider credentials are configured.
- Hostname-to-workspace route resolution.

## Admin Surface

Current v2 page:

- `/admin/domains`

Current API:

- `GET /api/admin/domains`
- `POST /api/admin/domains/poll`

## Operator Surface

Current public-launch Phase 4 page:

- `/dashboard/domains`

Current APIs:

- `GET /api/workspaces/:id/domains`
- `POST /api/workspaces/:id/domains`
- `POST /api/workspaces/:id/domains/:domainId/verify`
- `POST /api/workspaces/:id/domains/:domainId/activate`
- `DELETE /api/workspaces/:id/domains/:domainId`
- `GET /api/internal/host-cache?hostname=:hostname`

Domain creation is owner/admin-only, enforces the plan `custom_domains` entitlement, rejects Tripistic-owned hostnames, localhost, IPs, and malformed hostnames, then generates a random TXT ownership token.

## Runtime Flow

1. Request arrives with `Host`.
2. Middleware normalizes hostname without database access.
3. Reserved platform hosts continue to app/admin/marketing routes.
4. Platform tenant subdomains rewrite to `/book/:workspaceSlug`.
5. Candidate custom domains query the internal host-cache endpoint using `HOSTNAME_CACHE_SECRET` or `CRON_SECRET`.
6. Positive cache entries rewrite directly to `/book/:workspaceSlug`.
7. Apex rows with `redirect_to` issue a 308 redirect to the configured target.
8. Cache misses fall back to `/_host/:hostname`.
9. The server-rendered `_host` route resolves only active `custom_domains.hostname` or `custom_domains.redirect_to` rows in PostgreSQL.
10. The active domain renders the workspace storefront and `/tours/:tourSlug` booking page without exposing workspace IDs.

## Provider Adapter

`lib/domains/provider.ts` defines:

```ts
interface CustomHostnameProvider {
  create(hostname: string): Promise<ProviderHostname>;
  get(providerId: string): Promise<ProviderHostname>;
  remove(providerId: string): Promise<void>;
}
```

When `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` are set, the adapter provisions Cloudflare for SaaS Custom Hostnames, stores Cloudflare ownership DCV records, polls Cloudflare hostname and SSL status, and removes the provider hostname when a workspace disables the domain. With those variables unset, Tripistic stays in manual provider mode and never pretends to issue provider TLS.

## Required Environment

- `ROOT_DOMAIN`
- `NEXT_PUBLIC_ROOT_DOMAIN`
- `RESERVED_PLATFORM_HOSTS`
- `CUSTOM_DOMAIN_CNAME_TARGET`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_CUSTOM_HOSTNAME_DCV_METHOD`
- `CRON_SECRET`
- `DOMAIN_CRON_SECRET`
- `HOSTNAME_CACHE_SECRET`
- `HOSTNAME_CACHE_INTERNAL_URL`
- `HOSTNAME_EDGE_CACHE_TTL_SECONDS`

## Test Coverage

- Unit tests cover host validation, apex acceptance, edge host-cache behavior, and Cloudflare provider request/response mapping.
- PostgreSQL integration tests cover Cloudflare custom-hostname creation, DNS/TXT/CNAME verification fixtures, background polling, provider TLS activation, and apex-to-www resolver behavior.
- Playwright e2e seeds an active custom-domain fixture and verifies that a request carrying the custom `Host` header renders the storefront and tour page.

## Operational Notes

- Schedule `POST /api/admin/domains/poll` from Cloudflare Cron Triggers, GitHub Actions, or the production scheduler. Authenticate with `DOMAIN_CRON_SECRET` or `CRON_SECRET` through `x-tripistic-cron-secret` or `Authorization: Bearer`.
- Protect `GET /api/internal/host-cache` with `HOSTNAME_CACHE_SECRET` or `CRON_SECRET`; middleware uses it for short-lived hostname mapping cache.
- Integration and e2e tests require a real PostgreSQL `tripistic_test` database. The DNS/provider side is fixture-controlled in tests; no real DNS zone mutation is required locally.
