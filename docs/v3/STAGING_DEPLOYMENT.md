# Staging Deployment (V3)

Nothing in V3 should first meet a production customer. Domain lifecycle and
payment behaviour especially.

## 1. Application

```bash
git checkout claude/tripistic-production-upgrade-62u450
npm ci
npx prisma generate
npx prisma validate
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration      # needs .env.test → tripistic_test
npm run build
npx prisma migrate deploy     # applies 20260808172355_v3_cloudflare_platform
```

The migration is additive only: new tables, new enums, and one nullable column
on `custom_domains`. No backfill, no destructive change.

## 2. Cloudflare resources (manual, once per environment)

```bash
npx wrangler dispatch-namespace create tripistic-sites-staging
npx wrangler vectorize create tripistic-rag-staging --dimensions 768 --metric cosine
npx wrangler r2 bucket create tripistic-assets-staging
```

The AI Gateway is created in the dashboard (AI → AI Gateway). Note its id.

Vectorize metadata indexes must exist for the fields the tenant filter uses,
or pre-query filtering silently degrades:

```bash
npx wrangler vectorize create-metadata-index tripistic-rag-staging \
  --property-name workspaceId --type string
npx wrangler vectorize create-metadata-index tripistic-rag-staging \
  --property-name visibility --type string
npx wrangler vectorize create-metadata-index tripistic-rag-staging \
  --property-name sourceType --type string
```

## 3. Environment

Set on the staging container:

```
CLOUDFLARE_ENVIRONMENT=staging
CLOUDFLARE_ACCOUNT_ID=…
CLOUDFLARE_API_TOKEN=…            # Workers Scripts:Edit, Vectorize:Edit,
                                  # R2:Edit, Zone:SSL and Certificates:Edit
CLOUDFLARE_DISPATCH_NAMESPACE=tripistic-sites-staging
CLOUDFLARE_SITES_ROOT_DOMAIN=staging.tripistic.site
CLOUDFLARE_PREVIEW_DOMAIN=preview.staging.tripistic.site
CLOUDFLARE_VECTORIZE_INDEX=tripistic-rag-staging
CLOUDFLARE_R2_BUCKET=tripistic-assets-staging
CLOUDFLARE_AI_GATEWAY_ID=…
TRIPISTIC_WORKER_SIGNING_SECRET=$(openssl rand -base64 48)
TRIPISTIC_AI_ENABLED=true
```

## 4. Verification checklist

- [ ] `/admin/system-health` shows the Cloudflare block; unconfigured services
      read **Not Configured**, not red.
- [ ] Create a site from each of the seven templates; each lands with a
      homepage, a tours page and the legal pages.
- [ ] Publish. A `SiteDeployment` reaches `live` and `/_tripistic/health`
      answers on the subdomain.
- [ ] Edit a tour's price; the published site shows it within 60 seconds
      without a republish.
- [ ] Break a page (a hero with an invalid image), publish, confirm the
      deployment fails **and the previous version is still serving**.
- [ ] Roll back; the editor now shows the restored content.
- [ ] Publish a preview; confirm `X-Robots-Tag: noindex` and
      `robots.txt: Disallow: /`.
- [ ] **Vectorize filter check.** Index a private document in workspace A, query
      as workspace B against the real index, confirm nothing returns. This is
      the one isolation property the test suite cannot prove; do it here.
- [ ] Add a custom domain, follow the DNS instructions, watch it reach `active`.
- [ ] Bind it to a site, confirm the routing, then unbind and confirm the
      hostname and certificate survive.
- [ ] Exceed the AI credit limit on a low-tier plan; confirm a 402 with an
      upgrade message, then an admin override restores service.

## 5. Promotion

Only after every box above. Repeat step 2 with `-production` names and step 3
with `CLOUDFLARE_ENVIRONMENT=production`.
