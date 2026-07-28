-- Phase 4: custom domain provider state and routing metadata.

ALTER TABLE "custom_domains"
  ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "provider_hostname_id" TEXT,
  ADD COLUMN "provider_status" TEXT,
  ADD COLUMN "redirect_to" TEXT;

CREATE UNIQUE INDEX "custom_domains_provider_hostname_id_key" ON "custom_domains"("provider_hostname_id");
