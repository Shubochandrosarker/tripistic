# Runbook — production smoke test

How to prove a deployed Tripistic is actually serving customers correctly.
Written to be followed immediately after a deploy, by someone who did not
write the code.

The rule at the top, because it is the one most likely to be got wrong:

> **A run with skipped checks is not a verified deployment.** The smoke test
> exits `0` when no *critical* check failed — including when half of them never
> ran. Read the `NOT VERIFIED` block at the bottom of every run before you call
> a deploy good.

---

## 1. Running it

```
SMOKE_BASE_URL=https://tripistic.com npm run smoke
```

That is the minimum. It will pass the checks it can and tell you plainly which
ones it could not attempt. To verify everything, supply the rest:

```
SMOKE_BASE_URL=https://tripistic.com \
SMOKE_STOREFRONT_SLUG=your-live-workspace-slug \
SMOKE_CUSTOM_DOMAIN=https://book.some-operator.com \
SMOKE_CRON_SECRET="$CRON_SECRET" \
npm run smoke
```

| Variable | Required | What it unlocks |
| --- | --- | --- |
| `SMOKE_BASE_URL` | yes | Everything. Without it the script exits `2`. |
| `SMOKE_STOREFRONT_SLUG` | no | The public storefront and the embed-framing check |
| `SMOKE_CUSTOM_DOMAIN` | no | The two custom-domain checks |
| `SMOKE_CRON_SECRET` | no | The scheduler check (it *executes* a real job — see §4) |
| `SMOKE_TIMEOUT_MS` | no | Per-request timeout, default `15000` |
| `SMOKE_JSON_OUT` | no | Also print the full result set as JSON, for archiving or diffing |

It is HTTP-only — no browser, no database connection. It runs from a laptop,
from CI, or from the VPS itself. The browser journey is covered by the
Playwright suite; duplicating it here would make this too heavy to run after
every deploy, which is exactly when it earns its keep.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No critical failure. Warnings and skips may still be present. |
| `1` | At least one critical check failed. Do not serve customers. |
| `2` | The script could not run at all (no `SMOKE_BASE_URL`, or it crashed). |

Safe to gate a deploy on. Because only critical failures are non-zero, a
missing optional capability will not block a release.

---

## 2. What it checks, and why each one is here

**availability** — liveness, readiness, and the marketing home. Readiness is
also checked for *over*-sharing: a health endpoint that returns the database
host, the migration name or a stack trace is a free reconnaissance endpoint.

**transport** — HTTPS, HSTS, and http→https redirect. HSTS and the redirect are
warnings, not criticals, because they are the proxy's job (§3) and the app
cannot fix them.

**headers** — `X-Content-Type-Options`, `Referrer-Policy`, and the correlation
ID on the response. Then the one that is critical:

> **`/embed/**` must stay iframe-embeddable.** The embed widget exists to be
> placed on an operator's own website. A blanket `X-Frame-Options: DENY` or
> `frame-ancestors 'none'` looks like an improvement in review and silently
> blanks every embedded booking form in production — a failure nobody sees
> until an operator reports it. `tests/unit/security-headers.test.ts` pins it
> at the config level; this check pins it on the real response.

**boundaries** — the dashboard requires a session, the workspace API rejects
anonymous callers, the admin surface is not advertised, the scheduled-job
endpoint fails closed without its secret, and the Stripe webhook rejects an
unsigned payload. Each of these is a way a misconfigured deploy hands out
something it should not.

**account** — password reset must not reveal whether an address has an account
(an enumeration oracle), and registration must validate its input.

**public** — the storefront renders, an unknown slug 404s rather than falling
through to someone else's storefront, and the custom domain serves the right
operator's branding.

**claims** — the served HTML makes no unbacked AI claim and quotes no unmeasured
result. This is the Phase 10 repositioning, enforced against what is actually
served rather than what is in the repo. Marketing copy is edited more often
than code and by more people.

**scheduler** — the job runner executes when called with a valid secret.

---

## 3. Headers this deployment does *not* set

`Strict-Transport-Security` is deliberately absent from `next.config.ts`.

HSTS is a commitment, not a header: once a browser has seen it, that host is
https-only for the whole `max-age`. Set from the application it would apply to
every hostname the app is reached by — including an operator's custom domain,
whose TLS this deployment does not control and may not have issued yet. Getting
that wrong takes a customer's booking page offline in a way you cannot fix by
deploying, because the browser stops asking.

It belongs on the reverse proxy terminating TLS, which knows which hosts are
ready for it. On the Hostinger/Caddy setup:

```
tripistic.com {
	header Strict-Transport-Security "max-age=31536000; includeSubDomains"
	reverse_proxy 127.0.0.1:3000
}
```

Add it per-host as each custom domain's certificate is confirmed working — not
globally. The smoke test reports missing HSTS as a **warning** for exactly this
reason: it is expected to be absent until the proxy is configured, and it is
never the application's failure to fix.

---

## 4. Side effects — what running this actually does to production

"Read-only by default" is the design goal; here is the precise truth, so you
can decide rather than trust a slogan.

**The scheduler check runs a real job.** With `SMOKE_CRON_SECRET` set, it
invokes `payments.expire-pending`, which cancels unpaid bookings past their
payment window and releases the seats. That is a real mutation. It is safe
because it is the *same job the scheduler runs on its own cadence* — it only
touches bookings already past their window, so the effect is "sooner", not
"different". Still, this is why the secret is opt-in rather than assumed:
nothing should mutate production because a variable was left set from an
earlier session.

Omit it and the check is listed under `NOT VERIFIED` — the scheduler stays
unproven, which is honest and better than a tick you did not earn.

**Two checks POST, and consume rate-limit budget.** The password-reset check
sends two requests to `/api/auth/password-reset/request`, and the registration
check sends one deliberately-invalid signup. Neither creates a user, a token,
or an email: the reset addresses are `@example.invalid` and cannot exist, and
the signup is rejected by validation. But both consume real rate-limit
counters against the IP you run from.

The consequence, which is easy to miss: **running the smoke test in a tight
loop from one IP can exhaust that IP's password-reset budget.** If that IP is
an office NAT, you have briefly degraded password reset for everyone behind it.
Run it after deploys, not in a polling loop.

**Everything else is a GET** and changes nothing.

---

## 5. Reading a run

A real run — this one against a local production build over http, which is why
the TLS checks behave as they do:

```
========================================================================
24 passed · 1 critical · 0 warning · 4 skipped

CRITICAL — do not serve customers until these pass:
  - served over HTTPS: SMOKE_BASE_URL is http:// — session and payment
    cookies require TLS in production

NOT VERIFIED (4) — these checks did not run:
  - HSTS is set: not applicable over http
  - http redirects to https: not applicable over http
  - custom domain serves the operator's storefront: set SMOKE_CUSTOM_DOMAIN to check
  - custom domain is white-labelled: set SMOKE_CUSTOM_DOMAIN to check
========================================================================
```

Against the real VPS over `https://`, that critical clears, the two transport
skips become real checks, and the custom-domain pair runs as soon as you point
`SMOKE_CUSTOM_DOMAIN` at an operator domain. **A run over `http://localhost`
is a build check, not a deployment check** — it cannot tell you anything about
TLS, DNS, or your proxy, which is where most launch-day problems actually live.

Three things to do with this, in order:

1. **Critical failures** — stop. The deployment is serving customers something
   broken or something it should not. Roll forward with a fix; see
   `RUNBOOK-BACKUP-AND-ROLLBACK.md` for why not to restore the database.
2. **Skips** — decide whether you are willing to launch without them. Most are
   a missing environment variable and take a minute to resolve. A skipped
   *critical* check is an unverified critical check.
3. **Warnings** — schedule them. They do not block serving customers.

---

## 6. When to run it

- **After every deploy**, before announcing it. This is the primary use.
- **After any change to the proxy, DNS, or TLS** — the checks that fail there
  are invisible to the test suite, which never makes a real HTTP request to a
  real host.
- **After adding a custom domain** for an operator, with
  `SMOKE_CUSTOM_DOMAIN` pointed at it.
- **On a schedule**, if you want it. With `SMOKE_JSON_OUT` the result set can be
  archived and diffed between runs so a header that quietly disappears is
  noticed by something other than a customer.

## 7. What this cannot tell you

Stated explicitly so nobody reads a green run as more than it is:

- **It does not test payments end to end.** It verifies the webhook rejects
  unsigned payloads. It does not charge a card. Stripe's own test-mode flow and
  the integration suite cover the money path.
- **It does not test email delivery.** It verifies the outbox endpoint exists
  and the runner executes; whether SMTP actually delivers is proven by sending
  one and looking.
- **It does not run a browser.** Anything that only breaks after hydration —
  a client-side error, a broken date picker — is the Playwright suite's job.
- **It cannot see the future.** It describes the deployment at the moment it
  ran. A subsequent config change invalidates it.
