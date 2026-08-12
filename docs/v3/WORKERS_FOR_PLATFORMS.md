# Workers for Platforms

## Model

One user Worker per published site, inside a dispatch namespace. A dispatch
Worker owns the public hostnames and forwards to the right user Worker, so
per-tenant isolation costs no per-customer Cloudflare route.

**Tenants never author Worker code.** The only tenant-derived value in a
generated module is a JSON payload, embedded as
`JSON.stringify(JSON.stringify(payload))` — the inner call produces JSON, the
outer produces a correctly escaped JavaScript string literal of it, and there
is no character sequence that escapes it into code position. This is tested
directly (`tests/unit/site-render.test.ts`) by evaluating the payload line in
isolation and asserting the injected statement did not run.

Script names are derived server-side from workspace and site ids
(`siteScriptName`), never from a tenant-supplied slug, so one tenant cannot
collide with another's script name.

## What the Worker holds

Bindings: `TRIPISTIC_SITE_ID`, `TRIPISTIC_REVISION`, `TRIPISTIC_ENVIRONMENT`,
plus the page payload. **No secret of any kind** — no database URL, no Stripe
key, no AI key, no Cloudflare token, no signing secret. It reads live tour data
from the public tours API, the same endpoint any browser may call.

## Routes the Worker serves

| Path | Behaviour |
|---|---|
| any page path | pre-rendered HTML, tour slots filled from live data |
| `/robots.txt` | `Disallow: /` for previews, sitemap link otherwise |
| `/sitemap.xml` | non-noindex pages only |
| `/llms.txt` | only when the operator opted in, never for previews |
| `/_tripistic/health` | deployment id, revision id, page count — read by the publish health check |
| anything else | 404 with a link home |

Every response carries `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, and a CSP with `script-src 'none'` and
`frame-ancestors 'none'`. The renderer emits no scripts, so the strictest CSP
is also the correct one.

## Publish ordering

```
validate → snapshot → render → upload → health check → flip pointer
```

`site.publishedRevisionId` is written **last**. A failure at any earlier step
marks the deployment failed and leaves the previous revision serving — the
customer's website does not go down because their new homepage had a bad image
URL.

Rollback republishes an older revision through the same steps rather than
moving a pointer. Moving a pointer would leave the current script on the edge
while the database claimed an older revision was live, and that disagreement
only surfaces as a customer reporting that rollback did nothing.

## Unconfigured deployments

Without `CLOUDFLARE_DISPATCH_NAMESPACE`, Publish still validates, snapshots,
renders and stores a checksummed revision, then reports that it was not
deployed to the edge. That is a real configuration (staging without Cloudflare),
not a test-only path, and it is what `tests/integration/sites.test.ts` exercises.

## The dispatch Worker

Source in `cloudflare/website-platform/`, deployed once per environment.

It resolves the request hostname to a script name, forwards to that script
through the dispatch-namespace binding, and adds response headers. It holds the
signing secret and the namespace binding, and passes neither downstream — a
tenant Worker's bindings are pre-rendered pages and a public API origin, so even
a fully compromised tenant script reaches only data that was already public.

### Routing lookups

`GET /api/internal/site-routing?hostname=…` on Tripistic Core, behind the same
signed edge-auth path as every other Worker→Core call: HMAC, timestamp skew and
a single-use nonce. Unauthenticated, that endpoint would be a directory of every
tenant's live site and the internal script name serving it, which is exactly the
enumeration a takeover attempt starts with.

`lib/sites/routing.ts` answers it and refuses in three cases that matter:

- a **custom hostname whose domain is not `active`** — serving a site from an
  unverified hostname is the dangling-hostname failure the domain lifecycle
  exists to prevent;
- a **suspended site**, so a platform-admin suspension takes effect at the edge
  without needing a successful Worker deletion;
- a site with **no live deployment**, because a script left in the namespace by
  a previous failed publish must not be routed to.

### Caching, and failing soft

Results are cached in the colo-local Cache API — misses included, briefly, since
a hostname CNAMEd to Tripistic before its site exists is normal during DNS setup
and re-asking the origin on every crawler hit turns that into load.

When the origin is unreachable the last good answer is served for up to ten
minutes with `X-Tripistic-Route: stale`. A site already serving traffic should
not go dark because the control plane blipped; the tenant Worker holds its own
content and needs nothing from Core to render.

### Signing parity

The Worker carries its own copy of the canonical signing string, because it is a
separate deployment artifact and importing Node-targeted application code into
an edge bundle is not an option. `tests/unit/dispatch-worker.test.ts` asserts the
two canonical strings are byte-identical and that Core accepts a Worker-produced
signature. A silent divergence would 401 every lookup and take every tenant site
to the fallback page — loud, which is the right failure mode, but only if the
test catches it first.

### Deploying

```bash
cd cloudflare/website-platform
wrangler secret put TRIPISTIC_WORKER_SIGNING_SECRET --env production
npm run deploy:dry-run
npm run deploy:production
```

Routes are declared per environment, so a bare `wrangler deploy` with no `--env`
has no routes and cannot take over production hostnames. Custom tenant hostnames
reach the Worker through Cloudflare for SaaS custom hostnames pointed at the
fallback origin, not as `routes` entries — there is one Worker and an unbounded
number of tenant domains.
