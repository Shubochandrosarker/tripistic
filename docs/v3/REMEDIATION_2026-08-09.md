# Remediation Pass — 2026-08-09

Against the ten-task "Tripistic Open Issue Remediation" brief.

## Environment reality

The brief assumes a shell on the production VPS. This work was done in an
ephemeral cloud container holding a git clone of the repository. Verified, not
assumed:

```
curl http://147.93.104.126:8080/api/health/ready   → no route
ssh                                                → no ssh client installed
```

So **every task that mutates the VPS, Cloudflare, GitHub secrets or Stripe is
out of reach**, including the Task 0 pre-flight snapshot the brief makes a
precondition. Four of the ten tasks were repository changes and are done; the
rest are reported below with what a human needs to run.

Baseline: `main` @ `10bc2eb`. All work on
`claude/tripistic-production-upgrade-62u450`.

---

## Task status

| # | Task | Status | Evidence |
|---|---|---|---|
| 0 | Pre-flight snapshot | **BLOCKED** | no VPS access |
| 1 | Stop `AUTH_SECRET` rotating | **BLOCKED** | `bootstrap.sh` is not in the repository — see below |
| 2 | Stripe prices | **PARTIAL** | discovery done, table below; creation is human-only |
| 3 | Invisible above-the-fold hero | **DONE** | measured before/after, e2e spec added |
| 4 | Middleware fail-soft on bad JWT | **DONE (as hardening)** | root cause did not reproduce — see below |
| 5 | Rotate SSH key | **BLOCKED** | no VPS access |
| 6 | Port override into git | **DONE** | `BIND_ADDR` parameterised |
| 7a | HSTS | **BLOCKED** | Cloudflare dashboard |
| 7b | CSP report-only | **DONE** | header verified on a production build |
| 8 | Cloudflare Insights 503 | **REPORTED** | nothing in the app injects it |
| 9 | `api.`/`www.` DNS | **REPORTED** | decision required, no action taken |
| 10 | Stray file in `memberistic` | **REPORTED** | different repo, out of scope |

---

## Reality vs the brief

Rule 7 of the brief: report differences rather than improvise. Five.

### 1. `bootstrap.sh` does not exist in this repository

```
find . -name "bootstrap*" -not -path "./node_modules/*"   → (nothing)
```

Task 1's repository fix cannot be applied because there is no file to fix. The
script must live only on the VPS. The guard the brief specifies is correct and
should be applied there:

```bash
if ! grep -q '^AUTH_SECRET=' "$ENV_FILE"; then
  echo "AUTH_SECRET=$(openssl rand -base64 32)" >> "$ENV_FILE"
fi
```

Applied to **every** secret the script appends, and never keyed off an
unrelated variable such as `DB_PASSWORD`. If the script is committed to the
repository afterwards, this becomes testable.

### 2. The invisible hero has a different root cause than stated

The brief attributes it to `whileInView` not firing for elements already in the
viewport at mount. Measured on a production build in headless Chromium at
1280×800, **with scripting on, it does fire** — `/`, `/pricing` and `/features`
all passed before any change.

The reproducible failure is scripting **off** (or a hydration failure, or the
motion chunk not loading). Every reveal ships `style="opacity:0"` in the server
HTML and nothing removes it. Measured before the fix:

```
[no-JS] /         FAIL  H1 "The modern operating system for tou" o=0.00
                        A  "Start free trial"                    o=0.00
                        A  "Watch product demo"                  o=0.00
[no-JS] /pricing  FAIL  4 plan CTAs                              o=0.00
[no-JS] /features FAIL  top card row + headings                  o=0.00
```

After: all three PASS, with and without JavaScript.

The fix is therefore the `<noscript>` rule plus a `data-reveal` marker on every
primitive that animates opacity from zero — `AnimatedReveal`, `StaggerItem` and
`PageTransition`. The brief only anticipated the first; `/pricing` uses
`StaggerItem` and would have stayed broken.

The `immediate` prop and the removal of the `-80px` viewport margin were kept
as hardening: they remove the dependency on IntersectionObserver timing for the
first screen, which varies by engine and under slow chunk loading.

### 3. The `/login` lockout does not reproduce either

The brief attributes it to NextAuth v5 throwing `JWTSessionError` on an
undecryptable cookie inside middleware that also matches `/login`.

Tested the real scenario — a valid JWE minted under one `AUTH_SECRET`, served
under another:

```
                        pre-fix   post-fix
/login                   200       200
/dashboard               307       307
/admin                   307       307
```

`next-auth@5.0.0-beta.32` clears the session cookie and treats it as no
session. There is no throw, and the fail-soft wrapper's catch never fired.

The wrapper was kept as defence in depth and its code comment says exactly
that. The failure mode is asymmetric: one `try` costs nothing, and any future
throw from the session read locks every user out of the page they would use to
recover.

Also found while doing it: the middleware wraps `auth()` but never reads the
session — the `authorized` callback in `lib/auth/config.ts` does the actual
route protection, so the wrapper cannot simply be removed.

### 4. The brief's verification script for Task 3 is unsound

```js
if (parseFloat(getComputedStyle(el).opacity) < 0.9) { ... }
```

`getComputedStyle` on an `<h1>` inside an `opacity: 0` wrapper returns `"1"`.
Opacity is not inherited as a computed value. That script **passes on a
completely invisible page** — confirmed by running it against the unfixed
build, where it reported PASS on all three pages.

`tests/e2e/above-the-fold.spec.ts` multiplies opacity up the ancestor chain
instead, and was verified to fail on the unfixed build before being accepted.

### 5. `next.config.js` is `next.config.ts`

Minor. CSP added there.

---

## What changed in the repository

| Commit | Task |
|---|---|
| `4b55a2b` | T3 — above-the-fold visibility, `data-reveal`, noscript fallback, e2e spec |
| `001fdb1` | T4 — middleware fail-soft wrapper + contract test |
| next | T6 — `BIND_ADDR`; T7b — CSP report-only; docs |

Files: `components/marketing/animated-reveal.tsx`,
`components/marketing/motion.tsx`, `components/marketing/marketing-sections.tsx`,
`app/features/page.tsx`, `app/layout.tsx`, `middleware.ts`,
`docker-compose.hostinger.yml`, `next.config.ts`, `.env.example`,
`tests/e2e/above-the-fold.spec.ts`, `tests/unit/security-headers.test.ts`.

Gates: lint, typecheck, 439 unit, 396 integration, build, 20 e2e — all pass.

---

## Task 6 — how to retire the VPS override

The base compose file now publishes:

```yaml
ports:
  - "${BIND_ADDR:-0.0.0.0}:${HTTP_PORT:-8080}:3000"
```

Defaulting to `0.0.0.0` so no other environment changes behaviour. On the VPS:

```bash
cd /docker/tripistic-app
cp .env ".env.bak-$(date -u +%Y-%m-%d-%H%M)"
echo 'BIND_ADDR=147.93.104.126' >> .env          # HEALTHCHECK_HOST is already set
git pull
mv docker-compose.override.yml "docker-compose.override.yml.bak-$(date -u +%Y%m%d)"

docker compose -f docker-compose.hostinger.yml config | grep -A3 'ports:'   # expect 147.93.104.126:8080
docker compose -f docker-compose.hostinger.yml up -d app
ss -lntp | grep 8080
curl -s http://147.93.104.126:8080/api/health/ready
docker ps --filter name=traefik --format '{{.Names}} {{.Status}}'           # must be unchanged
```

**Stop and restore the override** if the bind fails with `address already in
use` or Traefik's status changes.

`.github/workflows/deploy.yml` still adds the override when present, which is
harmless and left alone.

---

## Task 2 — Stripe price discovery

The code reads Stripe price IDs from **two** places, and only the second is a
hard requirement:

| Plan slug | Env var (monthly) | Env var (yearly) |
|---|---|---|
| `solo` | `STRIPE_PRICE_SOLO_MONTHLY` | `STRIPE_PRICE_SOLO_YEARLY` |
| `operator` | `STRIPE_PRICE_OPERATOR_MONTHLY` | `STRIPE_PRICE_OPERATOR_YEARLY` |
| `agency` | `STRIPE_PRICE_AGENCY_MONTHLY` | `STRIPE_PRICE_AGENCY_YEARLY` |
| `enterprise` | — (sales-led, no self-serve price) | — |

Resolution order is `lib/billing/stripe-billing.ts::resolveStripeSubscriptionPriceId`:
the env var first, then `plan_prices.provider_price_id` for an active price on
an active plan. With neither, it throws the 409 the brief reports:

> `Stripe price is not configured for <plan> <interval>. Set
> STRIPE_PRICE_<PLAN>_<INTERVAL> or seed provider_price_id.`

`enterprise` has `monthlyPriceCents: null` in the catalogue and throws a
different error — "This plan does not support self-serve checkout" — by design.
It is sales-led; do not create a price for it.

Before creating anything, confirm the mode:

```bash
grep -o '^STRIPE_SECRET_KEY=sk_[a-z]*' /docker/tripistic-app/.env    # sk_test | sk_live
```

**Price IDs must come from the same mode as the secret key.** A test-mode
`price_` against a live key fails with an opaque error, and that is the most
common way this task gets redone.

Then add one line per variable to `.env` — no quotes, no trailing spaces — and
restart without rebuilding:

```bash
docker compose -f docker-compose.hostinger.yml up -d --no-deps --force-recreate app worker
```

Also confirm `STRIPE_WEBHOOK_SECRET` is set and a Stripe webhook endpoint points
at `https://app.tripistic.com/api/stripe/webhook`. Without it, subscriptions are
created but never activated.

---

## Tasks 8, 9, 10 — reported, no action

**T8 — Cloudflare Insights 503.** Nothing in the application injects the
beacon:

```
grep -rn "cloudflareinsights" --include="*.ts" --include="*.tsx" .   → (nothing)
```

So it is Cloudflare's automatic injection for the zone. Either configure Web
Analytics for `tripistic.com` properly, or turn automatic injection off. Do not
leave a 503-ing third-party script in the critical path.

**T9 — `api.` and `www.` DNS.** Needs an intent decision, not a change. `www`
should almost certainly become a tunnel CNAME plus a 301 to the apex.
`api.tripistic.com` has no service behind it; a proxied A record pointing at an
IP with no matching vhost is a latent support ticket — point it at the tunnel or
remove it.

**T10 — stray `deploy.yml` in `memberistic`.** A different repository and a
different stack. Not touched; deleting another repository's files needs explicit
approval.

---

## Still blocked on a human

- **H1 — Cloudflare balance ($9.88).** Gates everything: an account-wide
  suspension makes every other fix invisible.
- **H2 — Stripe products/prices.** Table above.
- **H3 — `VPS_SSH_KEY`.** Rotate on the VPS, paste into the GitHub secret from
  your own terminal. Never into a chat window.
- **T1 —** apply the idempotent-secret guard to `bootstrap.sh` on the VPS, and
  consider committing that script so it can be reviewed and tested.

## Residual risk

- The CSP is new. It is report-only and `/embed` is excluded, so it cannot
  break anything today — but the violation reports have not been read yet, and
  the source lists are a first draft.
- `BIND_ADDR` was validated by parsing the compose file, not by running Docker;
  no container runtime exists in this environment. The VPS verification steps
  above are the real test, and Traefik is the thing to watch.
- The above-the-fold spec was verified at 1280×720 and 1280×800. Very short
  viewports may place different content above its 80%-of-viewport fold line.
