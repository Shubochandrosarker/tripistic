CREATE TABLE "payment_refunds" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "payment_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "provider_refund_id" TEXT NOT NULL,
  "provider_balance_txn_id" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "created_by" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_disputes" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'stripe',
  "provider_dispute_id" TEXT NOT NULL,
  "provider_charge_id" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "evidence_due_by" TIMESTAMPTZ(6),
  "created_at_stripe" TIMESTAMPTZ(6),
  "closed_at" TIMESTAMPTZ(6),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_refunds_provider_refund_id_key"
  ON "payment_refunds"("provider_refund_id");

CREATE INDEX "payment_refunds_workspace_id_created_at_idx"
  ON "payment_refunds"("workspace_id", "created_at");

CREATE INDEX "payment_refunds_payment_id_idx"
  ON "payment_refunds"("payment_id");

CREATE INDEX "payment_refunds_created_by_idx"
  ON "payment_refunds"("created_by");

CREATE UNIQUE INDEX "payment_disputes_provider_dispute_id_key"
  ON "payment_disputes"("provider_dispute_id");

CREATE INDEX "payment_disputes_workspace_id_status_created_at_idx"
  ON "payment_disputes"("workspace_id", "status", "created_at");

CREATE INDEX "payment_disputes_payment_id_idx"
  ON "payment_disputes"("payment_id");

CREATE INDEX "payment_disputes_provider_charge_id_idx"
  ON "payment_disputes"("provider_charge_id");

ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_refunds"
  ADD CONSTRAINT "payment_refunds_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payment_disputes"
  ADD CONSTRAINT "payment_disputes_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_disputes"
  ADD CONSTRAINT "payment_disputes_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
