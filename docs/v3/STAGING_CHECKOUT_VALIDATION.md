# Staging: Stripe checkout validation (2026-08-12)

Scope note: this is **not** the same staging effort as `STAGING_DEPLOYMENT.md`.
That doc covers isolating the V3 Cloudflare *platform* features (Workers for
Platforms, Vectorize, R2) before they reach production. This doc covers a
plain, isolated copy of the whole app — same Docker image, same VPS — whose
only job is letting Stripe test-mode checkout run against a real, live
deployment instead of production. The two are compatible (this stack's
`.env.staging` can also carry the `CLOUDFLARE_ENVIRONMENT=staging` resources
from that doc later) but independent; this one exists because of a specific
guard, explained below.

## Why this exists

`lib/config/env-check.ts` refuses to boot the app when `NODE_ENV=production`
and `STRIPE_SECRET_KEY` starts with `sk_test_` — a blocking error inside the
release job Docker Compose gates the `app` service on. `NODE_ENV: production`
is hardcoded across every service in `docker-compose.hostinger.yml`, so there
is no way to run a Stripe test-mode key on that stack. Correct behaviour (a
live site should never silently take fake payments) but it means test-mode
validation cannot happen on the production compose stack, ever.

The fix isn't to weaken that guard — it's `APP_ENVIRONMENT`, a second,
independent environment label (see the doc comment on `deploymentTier()` in
`lib/config/env-check.ts`). `NODE_ENV` stays `production` everywhere (Next.js
needs it to serve the real optimized build via `next start`); `APP_ENVIRONMENT`
is what the Stripe-key guard actually keys off. Staging sets it to `staging`;
production leaves it unset (defaults to `NODE_ENV`, i.e. still `production`,
i.e. the guard still fully applies there — nothing about production's
behaviour changes).

## What's already in the repo

- `docker-compose.staging.yml` — a full, isolated stack: `tripistic-staging-app`,
  `-release`, `-worker`, `-db` (own container names, own `tripistic_staging_postgres`
  volume, own port default `8081`). No `backup` service — synthetic data only.
- `.env.staging.example` — template. Pre-filled with the 6 Stripe **test-mode**
  price IDs and the test-mode webhook endpoint id created 2026-08-12 (see the
  Stripe billing setup note in the project); `STRIPE_SECRET_KEY` /
  `STRIPE_WEBHOOK_SECRET` are left blank on purpose — never commit a real key,
  even a test one.

## What's left to do on the VPS

1. Copy `.env.staging.example` → `/docker/tripistic-app/.env.staging` (same
   directory as the live `.env`), fill in `POSTGRES_PASSWORD`, `AUTH_SECRET`
   (generate fresh — do not reuse production's), and `STRIPE_SECRET_KEY` /
   `STRIPE_WEBHOOK_SECRET` (the test-mode values from this session).
2. Add a DNS record + Cloudflare Tunnel ingress rule for `staging.tripistic.com`
   → the VPS, port `8081` (same pattern as the existing `app.tripistic.com`
   rule in the `wpistic-vps-prod` tunnel's `config.yml` — mirror that entry
   with the new hostname/port; the exact file path and existing rule syntax
   need to be read off the VPS, not guessed here).
3. Bring the stack up as its own Compose project, so nothing can collide with
   prod even if a rename was missed somewhere:
   ```bash
   cd /docker/tripistic-app
   docker compose -p tripistic-staging -f docker-compose.staging.yml \
     --env-file .env.staging up -d --build
   ```
4. Confirm isolation before doing anything else:
   ```bash
   docker ps --filter "name=tripistic-staging-"   # 4 containers, none named like prod's
   docker volume ls | grep tripistic               # tripistic_staging_postgres, separate from tripistic_postgres
   ```
5. Verify: `https://staging.tripistic.com/api/health/ready`, then run an
   actual signup → subscribe → Stripe test-card checkout
   (`4242 4242 4242 4242`, any future expiry/CVC) → confirm the webhook fires
   and the subscription activates in the staging DB.

## Teardown / ongoing use

Staging is disposable. To wipe and start clean:
```bash
docker compose -p tripistic-staging -f docker-compose.staging.yml down -v
```
`-v` drops `tripistic_staging_postgres` — confirm the project flag (`-p
tripistic-staging`) is correct before running this; it should be architecturally
impossible to hit prod's volume from this command (different name entirely),
but the habit of checking before any `down -v` is the one worth keeping regardless.

## Once checkout is proven here

Staging does not "become" production and its Stripe objects are not reused.
Going live is a separate, clean cutover on the production stack: get live-mode
(`sk_live_...`) keys once the Stripe account is fully verified, create a
**live-mode** webhook endpoint and 6 **live-mode** prices (test-mode and
live-mode are entirely separate object spaces in Stripe), write them into the
real `.env`, redeploy. Staging keeps running afterward as a standing place to
validate future changes before they reach customers.
