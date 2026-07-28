-- Public launch Phase 1: signed, idempotent SaaS billing webhook event log.
-- Traveler payment events stay in payment_events; subscription billing events
-- are persisted here to keep reconciliation domains separate.

CREATE TABLE "billing_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "subscription_id" TEXT,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_events_provider_event_id_key" ON "billing_events"("provider_event_id");
CREATE INDEX "billing_events_workspace_id_created_at_idx" ON "billing_events"("workspace_id", "created_at");
CREATE INDEX "billing_events_subscription_id_idx" ON "billing_events"("subscription_id");
CREATE INDEX "billing_events_event_type_idx" ON "billing_events"("event_type");

ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
