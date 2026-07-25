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

Each domain should provide:

- CNAME to the Tripistic edge hostname.
- TXT verification token proving domain ownership.

The expected CNAME is stored per row so future infrastructure can support region-specific targets.

## Health Checks

Required checks:

- DNS CNAME lookup.
- TXT ownership lookup.
- HTTP reachability.
- TLS certificate issuance.
- TLS expiry.
- Hostname-to-workspace route resolution.

## Admin Surface

Current v2 page:

- `/admin/domains`

Current API:

- `GET /api/admin/domains`

## Runtime Flow

1. Request arrives with `Host`.
2. Middleware normalizes hostname.
3. Lookup active `custom_domains.hostname`.
4. Resolve owning workspace.
5. Apply active white-label brand if present.
6. Render public booking or itinerary surface.

## Remaining Work

- Operator-facing domain submission.
- DNS/TXT verification job.
- Certificate provisioning integration.
- Host resolver middleware.
- Domain health alerts.
- Audit logs for domain changes.
