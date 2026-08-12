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
| `GROQ_API_KEY` | one fewer fallback provider |

With none of the three set and no Cloudflare account, the chat surfaces render
an honest "not configured" state. There is no fallback that synthesises an
answer — see `docs/v3/AI_ARCHITECTURE.md`.

## x402

| Variable | Missing means |
|---|---|
| `X402_ENABLED` | off; the protected routes answer 404 rather than a price |
| `X402_NETWORK` | defaults to `base-sepolia`, a testnet |
| `X402_PAY_TO` | not ready; the admin screen names this as the reason |
| `X402_FACILITATOR_URL` | not ready; nothing can be verified |
| `X402_ALLOW_MAINNET` | a mainnet `X402_NETWORK` is refused |

`X402_ALLOW_MAINNET` is a deliberate second key. One variable copied between
environments must not be enough to start accepting real funds on an
experimental rail.

## Dispatch Worker

Set in `cloudflare/website-platform/wrangler.toml` and by `wrangler secret`, not
in the application's `.env`:

| Variable | Missing means |
|---|---|
| `TRIPISTIC_API_ORIGIN` | routing lookups fail; every site serves the fallback page |
| `TRIPISTIC_WORKER_SIGNING_SECRET` | every lookup 401s. Must be byte-identical to Core's |
| `ROUTE_CACHE_TTL_SECONDS` | defaults to 60 |
| `ROUTE_NEGATIVE_TTL_SECONDS` | defaults to 15 |

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
