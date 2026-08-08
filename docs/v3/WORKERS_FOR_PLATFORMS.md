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
