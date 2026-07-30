-- Additive only. `session_version` defaults to 0 for every existing row, so
-- current sessions keep working across the deploy; nobody is logged out by
-- shipping this.

-- CreateEnum
CREATE TYPE "auth_token_purpose" AS ENUM ('email_verification', 'password_reset');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "request_ip" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");
CREATE INDEX "auth_tokens_user_id_purpose_created_at_idx" ON "auth_tokens"("user_id", "purpose", "created_at");
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters"("expires_at");

-- Existing accounts predate email verification. Treating them as unverified
-- would lock out every current user on deploy, so they are grandfathered:
-- verification is enforced from here forward, not retroactively.
UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL AND "deleted_at" IS NULL;

-- AlterEnum: account-security email templates.
ALTER TYPE "message_template_key" ADD VALUE IF NOT EXISTS 'email_verification';
ALTER TYPE "message_template_key" ADD VALUE IF NOT EXISTS 'password_reset';
ALTER TYPE "message_template_key" ADD VALUE IF NOT EXISTS 'password_changed';
