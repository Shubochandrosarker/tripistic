-- Additive only: every column is nullable or has a default, so existing rows
-- remain valid and no backfill is required. `message_status` gains a value
-- rather than redefining the type, which keeps the change safe to apply to a
-- live database while the previous release is still serving traffic.

-- AlterEnum
ALTER TYPE "message_status" ADD VALUE IF NOT EXISTS 'pending_retry';

-- AlterTable
ALTER TABLE "messages"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "next_retry_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_attempt_at" TIMESTAMPTZ(6),
  ADD COLUMN "dedupe_key" TEXT,
  ADD COLUMN "payload" JSONB;

-- CreateIndex
-- NULLs are distinct in a Postgres unique index, so pre-existing rows (which
-- all have a NULL dedupe_key) coexist while every keyed message is enforced
-- exactly once.
CREATE UNIQUE INDEX "messages_dedupe_key_key" ON "messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "messages_status_next_retry_at_idx" ON "messages"("status", "next_retry_at");
