-- Temporary per-workspace feature overrides.
--
-- A support grant with no expiry is not temporary, it is a permanent
-- entitlement that nobody wrote down. `expires_at` makes the grant end by
-- itself; `reason` and `granted_by` make it answerable afterwards.
--
-- All three are nullable and default to NULL, so every existing row — every
-- plan-level flag and every current workspace override — keeps behaving
-- exactly as it does today: NULL means permanent.

ALTER TABLE "feature_flags"
  ADD COLUMN "expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "granted_by" TEXT;

ALTER TABLE "feature_flags"
  ADD CONSTRAINT "feature_flags_granted_by_fkey"
  FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "feature_flags_expires_at_idx" ON "feature_flags"("expires_at");

-- A plan-level flag describes the plan and can never expire. Enforced in SQL
-- because Prisma's DSL cannot express it, and because an expiring plan flag
-- would silently remove a feature from every customer on that plan at once.
ALTER TABLE "feature_flags"
  ADD CONSTRAINT "feature_flags_plan_rows_never_expire"
  CHECK ("plan_id" IS NULL OR "expires_at" IS NULL);
