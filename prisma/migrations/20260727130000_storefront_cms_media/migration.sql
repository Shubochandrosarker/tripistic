-- Phase 3: workspace storefront draft/publish CMS and managed media assets.

CREATE TYPE "workspace_storefront_status" AS ENUM ('draft', 'published', 'disabled');
CREATE TYPE "workspace_media_asset_status" AS ENUM ('pending', 'uploaded', 'rejected', 'deleted');

CREATE TABLE "workspace_storefronts" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "status" "workspace_storefront_status" NOT NULL DEFAULT 'draft',
  "draft" JSONB NOT NULL DEFAULT '{}',
  "published" JSONB,
  "published_version" INTEGER NOT NULL DEFAULT 0,
  "published_at" TIMESTAMPTZ(6),
  "updated_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "workspace_storefronts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_storefronts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_storefronts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workspace_storefronts_workspace_id_key" ON "workspace_storefronts"("workspace_id");
CREATE INDEX "workspace_storefronts_workspace_id_status_idx" ON "workspace_storefronts"("workspace_id", "status");

CREATE TABLE "workspace_storefront_revisions" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "storefront_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "note" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_storefront_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_storefront_revisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_storefront_revisions_storefront_id_fkey" FOREIGN KEY ("storefront_id") REFERENCES "workspace_storefronts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_storefront_revisions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "workspace_storefront_revisions_version_positive" CHECK ("version_number" > 0)
);

CREATE UNIQUE INDEX "workspace_storefront_revisions_storefront_id_version_number_key" ON "workspace_storefront_revisions"("storefront_id", "version_number");
CREATE INDEX "workspace_storefront_revisions_workspace_id_created_at_idx" ON "workspace_storefront_revisions"("workspace_id", "created_at");

CREATE TABLE "workspace_media_assets" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "alt_text" TEXT NOT NULL,
  "focal_x" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  "focal_y" DECIMAL(4,3) NOT NULL DEFAULT 0.5,
  "status" "workspace_media_asset_status" NOT NULL DEFAULT 'pending',
  "uploaded_by" TEXT,
  "uploaded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "workspace_media_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_media_assets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "workspace_media_assets_byte_size_bounds" CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
  CONSTRAINT "workspace_media_assets_dimensions_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0)),
  CONSTRAINT "workspace_media_assets_focal_bounds" CHECK ("focal_x" >= 0 AND "focal_x" <= 1 AND "focal_y" >= 0 AND "focal_y" <= 1)
);

CREATE UNIQUE INDEX "workspace_media_assets_storage_key_key" ON "workspace_media_assets"("storage_key");
CREATE UNIQUE INDEX "workspace_media_assets_workspace_id_id_key" ON "workspace_media_assets"("workspace_id", "id");
CREATE INDEX "workspace_media_assets_workspace_id_status_created_at_idx" ON "workspace_media_assets"("workspace_id", "status", "created_at");
