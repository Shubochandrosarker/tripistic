-- Phase 4 completion: Cloudflare SaaS Custom Hostnames provider state and cache invalidation metadata.

ALTER TABLE "custom_domains"
  ADD COLUMN "provider_ssl_status" TEXT,
  ADD COLUMN "provider_errors" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "provider_txt_name" TEXT,
  ADD COLUMN "provider_txt_value" TEXT,
  ADD COLUMN "provider_http_url" TEXT,
  ADD COLUMN "provider_http_body" TEXT,
  ADD COLUMN "cache_invalidated_at" TIMESTAMPTZ(6);
