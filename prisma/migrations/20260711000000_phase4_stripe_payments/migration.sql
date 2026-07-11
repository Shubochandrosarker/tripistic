-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('requires_payment', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "provider_payment_intent_id" TEXT,
    "provider_checkout_session_id" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'requires_payment',
    "payment_method" TEXT,
    "receipt_url" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "refunded_amount" INTEGER,
    "expires_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "payment_id" TEXT,
    "booking_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_workspace_id_booking_id_idx" ON "payments"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "payments_provider_payment_intent_id_idx" ON "payments"("provider_payment_intent_id");

-- CreateIndex
CREATE INDEX "payments_provider_checkout_session_id_idx" ON "payments"("provider_checkout_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events"("payment_id");

-- CreateIndex
CREATE INDEX "payment_events_booking_id_idx" ON "payment_events"("booking_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_booking_id_fkey" FOREIGN KEY ("workspace_id", "booking_id") REFERENCES "bookings"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

