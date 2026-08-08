# Environment Variables (V3)

Names only. Values never appear in this repository. Full annotations live in
`.env.example`; this is the summary and the "what breaks without it" column.

## Cloudflare platform

| Variable | Without it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | every Cloudflare capability off; domains use manual provider mode |
| `CLOUDFLARE_ACCOUNT_ID` | no Workers, Vectorize, R2 or Workers AI |
| `CLOUDFLARE_ZONE_ID` | custom hostnames unavailable |
| `CLOUDFLARE_CUSTOM_HOSTNAME_ZONE_ID` | falls back to `CLOUDFLARE_ZONE_ID` |
| `CLOUDFLARE_CUSTOM_HOSTNAME_DCV_METHOD` | defaults to `txt` |
| `CLOUDFLARE_ENVIRONMENT` | defaults to `development`, never `production` |
| `CLOUDFLARE_DISPATCH_NAMESPACE` | Publish builds and stores a revision but does not deploy |
| `CLOUDFLARE_SITES_ROOT_DOMAIN` | sites have no public hostname |
| `CLOUDFLARE_PREVIEW_DOMAIN` | preview deployments have no URL |
| `CLOUDFLARE_R2_BUCKET` | assets use the configured S3 storage |
| `CLOUDFLARE_VECTORIZE_INDEX` | in-process vector store (dev/CI only, not durable) |
| `CLOUDFLARE_AI_SEARCH_INSTANCE` | reserved; unused in this release |
| `CLOUDFLARE_AI_GATEWAY_ID` | model calls go direct to the provider |
| `CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID` | falls back to `CLOUDFLARE_ACCOUNT_ID` |
| `TRIPISTIC_WORKER_SIGNING_SECRET` | Workers cannot call Tripistic APIs (≥32 chars) |

## AI

| Variable | Without it |
|---|---|
| `TRIPISTIC_AI_ENABLED` | master switch, default `false` |
| `OPENAI_API_KEY` | frontier-model tasks fall back to Workers AI |
| `OPENROUTER_API_KEY` | one fewer fallback provider |

## x402 (reserved, unimplemented)

`X402_ENABLED`, `X402_NETWORK`, `X402_PAY_TO`, `X402_FACILITATOR_URL`.

## Pre-existing, unchanged

`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`,
`ROOT_DOMAIN`, `NEXT_PUBLIC_ROOT_DOMAIN`, `RESERVED_PLATFORM_HOSTS`,
`CUSTOM_DOMAIN_CNAME_TARGET`, `CRON_SECRET`, `DOMAIN_CRON_SECRET`,
`HOSTNAME_CACHE_SECRET`, `HOSTNAME_CACHE_INTERNAL_URL`,
`HOSTNAME_EDGE_CACHE_TTL_SECONDS`, the `STRIPE_*` set, the `SMTP_*` set, the
`S3_*` set, and the `NEXT_PUBLIC_*` analytics tags.

## Verification

`lib/config/env-check.ts` fails boot on a missing or placeholder `AUTH_SECRET`,
a non-postgres `DATABASE_URL`, or a Stripe key with no webhook secret. V3
variables are all optional and are reported by the admin System Health page as
Healthy / Degraded / Unavailable / Not Configured rather than blocking boot.
