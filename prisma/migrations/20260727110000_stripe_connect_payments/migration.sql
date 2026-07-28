CREATE TYPE "workspace_payment_account_status" AS ENUM (
  'not_started',
  'onboarding',
  'restricted',
  'enabled',
  'disabled'
);

CREATE TABLE "workspace_payment_accounts" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "provider_account_id" TEXT NOT NULL,
  "account_type" TEXT NOT NULL DEFAULT 'express',
  "status" "workspace_payment_account_status" NOT NULL DEFAULT 'onboarding',
  "country" TEXT,
  "default_currency" TEXT,
  "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
  "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
  "details_submitted" BOOLEAN NOT NULL DEFAULT false,
  "platform_fee_bps" INTEGER NOT NULL DEFAULT 0,
  "disabled_reason" TEXT,
  "requirements" JSONB NOT NULL DEFAULT '{}',
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "last_synced_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_payment_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_payment_accounts_workspace_id_key"
  ON "workspace_payment_accounts"("workspace_id");

CREATE UNIQUE INDEX "workspace_payment_accounts_provider_account_id_key"
  ON "workspace_payment_accounts"("provider_account_id");

CREATE INDEX "workspace_payment_accounts_status_charges_enabled_payouts_enabled_idx"
  ON "workspace_payment_accounts"("status", "charges_enabled", "payouts_enabled");

ALTER TABLE "workspace_payment_accounts"
  ADD CONSTRAINT "workspace_payment_accounts_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
  ADD COLUMN "payment_account_id" TEXT,
  ADD COLUMN "provider_charge_id" TEXT,
  ADD COLUMN "provider_transfer_id" TEXT,
  ADD COLUMN "provider_balance_txn_id" TEXT,
  ADD COLUMN "provider_connected_account_id" TEXT,
  ADD COLUMN "platform_fee_amount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stripe_fee_amount" INTEGER;

CREATE INDEX "payments_payment_account_id_idx"
  ON "payments"("payment_account_id");

CREATE INDEX "payments_provider_connected_account_id_idx"
  ON "payments"("provider_connected_account_id");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_payment_account_id_fkey"
  FOREIGN KEY ("payment_account_id") REFERENCES "workspace_payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_events"
  ADD COLUMN "provider_account_id" TEXT;
