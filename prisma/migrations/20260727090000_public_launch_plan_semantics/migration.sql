-- Public launch Phase 1 foundation: structured plan prices, entitlements,
-- and workspace usage meters. Expand-only: existing plans/subscriptions/
-- feature_flags columns remain for backward compatibility during rollout.

CREATE TABLE "plan_prices" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billing_provider" TEXT,
    "provider_price_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_prices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "entitlements" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "limit_value" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "usage_meters" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usage_meters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_prices_provider_price_id_key" ON "plan_prices"("provider_price_id");
CREATE UNIQUE INDEX "plan_prices_plan_id_interval_currency_key" ON "plan_prices"("plan_id", "interval", "currency");
CREATE INDEX "plan_prices_plan_id_is_active_idx" ON "plan_prices"("plan_id", "is_active");

CREATE UNIQUE INDEX "entitlements_plan_id_key_key" ON "entitlements"("plan_id", "key");
CREATE INDEX "entitlements_key_enabled_idx" ON "entitlements"("key", "enabled");

CREATE UNIQUE INDEX "usage_meters_workspace_id_key_period_start_period_end_key" ON "usage_meters"("workspace_id", "key", "period_start", "period_end");
CREATE INDEX "usage_meters_workspace_id_key_period_end_idx" ON "usage_meters"("workspace_id", "key", "period_end");

ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "usage_meters" ADD CONSTRAINT "usage_meters_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "plan_prices"
  ADD CONSTRAINT "plan_prices_amount_nonnegative" CHECK ("amount" >= 0);

ALTER TABLE "plan_prices"
  ADD CONSTRAINT "plan_prices_interval_valid" CHECK ("interval" IN ('monthly', 'yearly'));

ALTER TABLE "entitlements"
  ADD CONSTRAINT "entitlements_limit_value_valid" CHECK ("limit_value" IS NULL OR "limit_value" >= -1);

ALTER TABLE "usage_meters"
  ADD CONSTRAINT "usage_meters_used_nonnegative" CHECK ("used" >= 0);

ALTER TABLE "usage_meters"
  ADD CONSTRAINT "usage_meters_period_valid" CHECK ("period_end" > "period_start");
