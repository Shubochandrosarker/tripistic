-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('draft', 'generating', 'ready', 'publishing', 'published', 'failed', 'suspended');

-- CreateEnum
CREATE TYPE "SiteDeploymentStatus" AS ENUM ('queued', 'building', 'deploying', 'live', 'failed', 'rolled_back');

-- CreateEnum
CREATE TYPE "KnowledgeScope" AS ENUM ('global', 'public', 'private');

-- CreateEnum
CREATE TYPE "KnowledgeIndexStatus" AS ENUM ('pending', 'indexing', 'indexed', 'failed', 'stale');

-- CreateEnum
CREATE TYPE "AiSurface" AS ENUM ('public_advisor', 'workspace_copilot', 'contextual', 'system');

-- CreateEnum
CREATE TYPE "X402PaymentStatus" AS ENUM ('pending', 'verified', 'rejected', 'expired');

-- AlterTable
ALTER TABLE "custom_domains" ADD COLUMN     "site_id" TEXT;

-- CreateTable
CREATE TABLE "service_request_nonces" (
    "nonce" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_request_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'draft',
    "template_key" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "home_page_id" TEXT,
    "published_revision_id" TEXT,
    "draft_revision_id" TEXT,
    "theme" JSONB NOT NULL DEFAULT '{}',
    "seo" JSONB NOT NULL DEFAULT '{}',
    "navigation" JSONB NOT NULL DEFAULT '{}',
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_pages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "seo" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "system_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_revisions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_deployments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "status" "SiteDeploymentStatus" NOT NULL DEFAULT 'queued',
    "environment" TEXT NOT NULL DEFAULT 'production',
    "script_name" TEXT,
    "preview_url" TEXT,
    "live_url" TEXT,
    "error_message" TEXT,
    "health_check_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "triggered_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "scope" "KnowledgeScope" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "KnowledgeIndexStatus" NOT NULL DEFAULT 'pending',
    "checksum" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "indexed_at" TIMESTAMPTZ(6),
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "source_id" TEXT NOT NULL,
    "scope" "KnowledgeScope" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "KnowledgeIndexStatus" NOT NULL DEFAULT 'pending',
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "indexed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunk_refs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "document_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "vector_id" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunk_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_index_jobs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "source_id" TEXT NOT NULL,
    "status" "KnowledgeIndexStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_index_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "user_id" TEXT,
    "surface" "AiSurface" NOT NULL,
    "title" TEXT,
    "public_token" TEXT,
    "summary" TEXT,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversation_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB NOT NULL DEFAULT '[]',
    "citations" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "user_id" TEXT,
    "surface" "AiSurface" NOT NULL,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_millicents" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "error_type" TEXT,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x402_payments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "request_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "payer" TEXT,
    "transaction_reference" TEXT,
    "status" "X402PaymentStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMPTZ(6),
    "access_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x402_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "x402_access_grants" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "payment_id" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "max_uses" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "x402_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_request_nonces_expires_at_idx" ON "service_request_nonces"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sites_subdomain_key" ON "sites"("subdomain");

-- CreateIndex
CREATE INDEX "sites_workspace_id_status_idx" ON "sites"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sites_workspace_id_slug_key" ON "sites"("workspace_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "sites_workspace_id_id_key" ON "sites"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "site_pages_workspace_id_site_id_position_idx" ON "site_pages"("workspace_id", "site_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "site_pages_site_id_path_key" ON "site_pages"("site_id", "path");

-- CreateIndex
CREATE INDEX "site_revisions_workspace_id_created_at_idx" ON "site_revisions"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "site_revisions_site_id_version_number_key" ON "site_revisions"("site_id", "version_number");

-- CreateIndex
CREATE INDEX "site_deployments_workspace_id_site_id_created_at_idx" ON "site_deployments"("workspace_id", "site_id", "created_at");

-- CreateIndex
CREATE INDEX "site_deployments_status_created_at_idx" ON "site_deployments"("status", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_sources_workspace_id_scope_status_idx" ON "knowledge_sources"("workspace_id", "scope", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_sources_scope_source_type_source_id_key" ON "knowledge_sources"("scope", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_workspace_id_scope_status_idx" ON "knowledge_documents"("workspace_id", "scope", "status");

-- CreateIndex
CREATE INDEX "knowledge_documents_source_id_version_idx" ON "knowledge_documents"("source_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunk_refs_vector_id_key" ON "knowledge_chunk_refs"("vector_id");

-- CreateIndex
CREATE INDEX "knowledge_chunk_refs_workspace_id_idx" ON "knowledge_chunk_refs"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunk_refs_document_id_chunk_index_key" ON "knowledge_chunk_refs"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "knowledge_index_jobs_status_created_at_idx" ON "knowledge_index_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "knowledge_index_jobs_workspace_id_status_idx" ON "knowledge_index_jobs"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_public_token_key" ON "ai_conversations"("public_token");

-- CreateIndex
CREATE INDEX "ai_conversations_workspace_id_updated_at_idx" ON "ai_conversations"("workspace_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversation_messages_conversation_id_created_at_idx" ON "ai_conversation_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_workspace_id_created_at_idx" ON "ai_usage_events"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_surface_created_at_idx" ON "ai_usage_events"("surface", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "x402_payments_request_id_key" ON "x402_payments"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "x402_payments_transaction_reference_key" ON "x402_payments"("transaction_reference");

-- CreateIndex
CREATE INDEX "x402_payments_status_created_at_idx" ON "x402_payments"("status", "created_at");

-- CreateIndex
CREATE INDEX "x402_payments_workspace_id_created_at_idx" ON "x402_payments"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "x402_access_grants_token_hash_key" ON "x402_access_grants"("token_hash");

-- CreateIndex
CREATE INDEX "x402_access_grants_expires_at_idx" ON "x402_access_grants"("expires_at");

-- CreateIndex
CREATE INDEX "custom_domains_site_id_idx" ON "custom_domains"("site_id");

-- AddForeignKey
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_pages" ADD CONSTRAINT "site_pages_workspace_id_site_id_fkey" FOREIGN KEY ("workspace_id", "site_id") REFERENCES "sites"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_revisions" ADD CONSTRAINT "site_revisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_revisions" ADD CONSTRAINT "site_revisions_workspace_id_site_id_fkey" FOREIGN KEY ("workspace_id", "site_id") REFERENCES "sites"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_revisions" ADD CONSTRAINT "site_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_workspace_id_site_id_fkey" FOREIGN KEY ("workspace_id", "site_id") REFERENCES "sites"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "site_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_deployments" ADD CONSTRAINT "site_deployments_triggered_by_fkey" FOREIGN KEY ("triggered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk_refs" ADD CONSTRAINT "knowledge_chunk_refs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunk_refs" ADD CONSTRAINT "knowledge_chunk_refs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_index_jobs" ADD CONSTRAINT "knowledge_index_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_index_jobs" ADD CONSTRAINT "knowledge_index_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversation_messages" ADD CONSTRAINT "ai_conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x402_payments" ADD CONSTRAINT "x402_payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x402_access_grants" ADD CONSTRAINT "x402_access_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "x402_access_grants" ADD CONSTRAINT "x402_access_grants_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "x402_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
