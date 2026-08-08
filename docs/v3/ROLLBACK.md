# Rollback (V3)

## Application

```bash
docker compose -f docker-compose.hostinger.yml pull <previous-tag>
docker compose -f docker-compose.hostinger.yml up -d
```

**The database migration does not need reverting.** `20260808172355_v3_cloudflare_platform`
only adds tables, enums and one nullable column; the previous release ignores
all of them. Rolling the image back without touching the schema is the intended
path and is safer than a down-migration.

If the schema must be reverted (it should not be):

```sql
BEGIN;
ALTER TABLE custom_domains DROP COLUMN site_id;
DROP TABLE x402_access_grants, x402_payments,
           ai_usage_events, ai_conversation_messages, ai_conversations,
           knowledge_index_jobs, knowledge_chunk_refs, knowledge_documents,
           knowledge_sources,
           site_deployments, site_revisions, site_pages, sites,
           service_request_nonces CASCADE;
DROP TYPE "X402PaymentStatus", "AiSurface", "KnowledgeIndexStatus",
          "KnowledgeScope", "SiteDeploymentStatus", "SiteStatus";
DELETE FROM _prisma_migrations WHERE migration_name = '20260808172355_v3_cloudflare_platform';
COMMIT;
```

This destroys every published site's revision history. Take a backup first.

## Disabling a V3 capability without a deploy

Each is independently switchable by unsetting its variable and restarting:

| Unset | Effect |
|---|---|
| `CLOUDFLARE_DISPATCH_NAMESPACE` | Publish stops deploying; existing Workers keep serving |
| `CLOUDFLARE_VECTORIZE_INDEX` | RAG falls back to the in-process store |
| `CLOUDFLARE_AI_GATEWAY_ID` | model calls go direct to the provider |
| `TRIPISTIC_AI_ENABLED` | AI surfaces off |
| `TRIPISTIC_WORKER_SIGNING_SECRET` | signed edge API refuses everything |

Per-workspace kill switches are available as `FeatureFlag` overrides in
`/admin`, which is the finer-grained tool: it turns a feature off for one
customer without a deploy and without affecting anyone else.

## Rolling back one site

Use the site's own rollback (`POST …/sites/[siteId]/rollback`). It republishes
an earlier revision through the full pipeline and restores the draft to match,
so the editor and the live site agree afterwards.

To take a site off the edge entirely, delete it — `unpublishSite` removes the
Worker before the record is soft-deleted.

## Verifying a rollback

```bash
curl -fsS https://app.tripistic.com/api/health/ready
npm run smoke
```

Then confirm a booking end to end in Stripe test mode. Payments are the thing
that must be working, and they are untouched by every V3 change.
