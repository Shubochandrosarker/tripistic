CREATE TYPE "subscription_change_status" AS ENUM ('scheduled', 'applied', 'cancelled', 'failed');

ALTER TABLE "subscriptions"
  ADD COLUMN "billing_interval" TEXT,
  ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "grace_ends_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_payment_failed_at" TIMESTAMPTZ(6);

CREATE TABLE "subscription_changes" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "from_plan_id" TEXT,
  "to_plan_id" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "provider_schedule_id" TEXT,
  "status" "subscription_change_status" NOT NULL DEFAULT 'scheduled',
  "effective_at" TIMESTAMPTZ(6) NOT NULL,
  "requested_by" TEXT,
  "applied_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "subscription_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_changes_provider_schedule_id_key"
  ON "subscription_changes"("provider_schedule_id");

CREATE INDEX "subscriptions_status_grace_ends_at_idx"
  ON "subscriptions"("status", "grace_ends_at");

CREATE INDEX "subscription_changes_workspace_id_status_effective_at_idx"
  ON "subscription_changes"("workspace_id", "status", "effective_at");

CREATE INDEX "subscription_changes_subscription_id_status_idx"
  ON "subscription_changes"("subscription_id", "status");

CREATE INDEX "subscription_changes_to_plan_id_idx"
  ON "subscription_changes"("to_plan_id");

CREATE INDEX "subscription_changes_requested_by_idx"
  ON "subscription_changes"("requested_by");

ALTER TABLE "subscription_changes"
  ADD CONSTRAINT "subscription_changes_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_changes"
  ADD CONSTRAINT "subscription_changes_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subscription_changes"
  ADD CONSTRAINT "subscription_changes_from_plan_id_fkey"
  FOREIGN KEY ("from_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscription_changes"
  ADD CONSTRAINT "subscription_changes_to_plan_id_fkey"
  FOREIGN KEY ("to_plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_changes"
  ADD CONSTRAINT "subscription_changes_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
