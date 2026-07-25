-- v2.0.0 enterprise platform foundation: white label, custom domains,
-- AI provider registry, and platform maintenance mode.

-- CreateEnum
CREATE TYPE "white_label_status" AS ENUM ('draft', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "custom_domain_status" AS ENUM ('pending_dns', 'verifying', 'verified', 'ssl_pending', 'active', 'failed', 'disabled');

-- CreateEnum
CREATE TYPE "ai_provider_status" AS ENUM ('active', 'disabled', 'degraded');

-- CreateTable
CREATE TABLE "workspace_white_labels" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#059669',
    "accent_color" TEXT NOT NULL DEFAULT '#18181b',
    "support_email" TEXT,
    "login_headline" TEXT,
    "email_from_name" TEXT,
    "pdf_footer" TEXT,
    "api_brand_name" TEXT,
    "status" "white_label_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_white_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_domains" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" "custom_domain_status" NOT NULL DEFAULT 'pending_dns',
    "verification_token" TEXT NOT NULL,
    "expected_cname" TEXT NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "ssl_issued_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "last_check_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_configs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "base_url" TEXT,
    "default_model" TEXT,
    "status" "ai_provider_status" NOT NULL DEFAULT 'disabled',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_settings" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "maintenance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_white_labels_workspace_id_key" ON "workspace_white_labels"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_white_labels_status_idx" ON "workspace_white_labels"("status");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_hostname_key" ON "custom_domains"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "custom_domains_verification_token_key" ON "custom_domains"("verification_token");

-- CreateIndex
CREATE INDEX "custom_domains_workspace_id_status_idx" ON "custom_domains"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "custom_domains_status_last_checked_at_idx" ON "custom_domains"("status", "last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_configs_provider_display_name_key" ON "ai_provider_configs"("provider", "display_name");

-- CreateIndex
CREATE INDEX "ai_provider_configs_status_is_default_idx" ON "ai_provider_configs"("status", "is_default");

-- AddForeignKey
ALTER TABLE "workspace_white_labels" ADD CONSTRAINT "workspace_white_labels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the singleton row so admin pages can read maintenance state without
-- inventing defaults outside the database.
INSERT INTO "maintenance_settings" ("id", "enabled", "updated_at")
VALUES ('platform', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
