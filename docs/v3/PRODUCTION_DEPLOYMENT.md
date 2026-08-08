# Production Deployment (V3)

Tripistic Core stays on the Hostinger VPS. V3 does **not** move the application
to Workers, and doing so would add deployment risk for no benefit this release
needs.

## Order

```bash
# 1. Back up first. The migration is additive, but the rollback plan assumes
#    a restore point exists.
docker compose -f docker-compose.hostinger.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-pre-v3.sql.gz

# 2. Deploy the image built from the tag, then migrate.
docker compose -f docker-compose.hostinger.yml pull
docker compose -f docker-compose.hostinger.yml run --rm app npx prisma migrate deploy
docker compose -f docker-compose.hostinger.yml up -d

# 3. Smoke.
npm run smoke
curl -fsS https://app.tripistic.com/api/health/ready
```

## Cloudflare resources

```bash
npx wrangler dispatch-namespace create tripistic-sites-production
npx wrangler vectorize create tripistic-rag-production --dimensions 768 --metric cosine
npx wrangler vectorize create-metadata-index tripistic-rag-production --property-name workspaceId --type string
npx wrangler vectorize create-metadata-index tripistic-rag-production --property-name visibility --type string
npx wrangler vectorize create-metadata-index tripistic-rag-production --property-name sourceType --type string
npx wrangler r2 bucket create tripistic-assets-production
```

## Still manual — no code in this repository does these

1. **Cloudflare account and API token.** Scopes: Workers Scripts:Edit,
   Workers for Platforms, Vectorize:Edit, R2:Edit, Zone SSL and
   Certificates:Edit on the custom-hostname zone.
2. **The dispatch Worker itself.** This release generates and uploads *user*
   Workers. The dispatch Worker that maps `hostname → site → user Worker` and
   owns the `*.tripistic.site` route is not in this repository and must be
   created and bound to the namespace.
3. **DNS.** A wildcard record for `*.tripistic.site`, the fallback origin for
   Cloudflare for SaaS, and the `CUSTOM_DOMAIN_CNAME_TARGET` record operators
   are told to CNAME to.
4. **WAF and rate-limiting rules.** Per-risk policies, not one global limit:
   login, register, password reset, public booking creation, public AI chat,
   authenticated AI chat, knowledge upload, site publish, domain verification.
   Application-level limits exist in `lib/security/rate-limit.ts`; the edge
   rules are account configuration.
5. **HSTS**, on the reverse proxy that terminates TLS and knows which hostnames
   are ready for it — deliberately not from the application, which also answers
   on operator domains.
6. **AI Gateway**, and a provider key if frontier-model tasks are wanted.
7. **Scheduled jobs.** `POST /api/jobs/run` with `CRON_SECRET`, now including
   `ai.reindex-knowledge`.

## Rollout order

Ship with `TRIPISTIC_AI_ENABLED=false` and no dispatch namespace. Everything
pre-V3 behaves identically. Then enable Workers for Platforms for a small set of
workspaces, then AI, then RAG. Every V3 capability is independently switchable
by omitting its environment variable — that is the rollout mechanism.
