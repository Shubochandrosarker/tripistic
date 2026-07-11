-- CreateEnum
CREATE TYPE "consent_status" AS ENUM ('subscribed', 'unsubscribed', 'unknown');

-- CreateEnum
CREATE TYPE "message_channel" AS ENUM ('email');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('queued', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "message_template_key" AS ENUM ('booking_confirmation', 'booking_reminder', 'review_request', 'member_invitation');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "customer_id" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "consent_status" "consent_status" NOT NULL DEFAULT 'unknown',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "customer_id" TEXT,
    "channel" "message_channel" NOT NULL DEFAULT 'email',
    "template_key" "message_template_key" NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'queued',
    "to_email" TEXT,
    "subject" TEXT,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_workspace_id_consent_status_idx" ON "customers"("workspace_id", "consent_status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspace_id_email_key" ON "customers"("workspace_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspace_id_id_key" ON "customers"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_booking_id_idx" ON "messages"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "messages_workspace_id_template_key_booking_id_idx" ON "messages"("workspace_id", "template_key", "booking_id");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_customer_id_idx" ON "bookings"("workspace_id", "customer_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

