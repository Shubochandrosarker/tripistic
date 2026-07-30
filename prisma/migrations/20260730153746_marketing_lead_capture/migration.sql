-- CreateEnum
CREATE TYPE "lead_delivery_status" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "newsletter_subscriber_status" AS ENUM ('pending_confirmation', 'subscribed', 'unsubscribed');

-- AlterTable
ALTER TABLE "payment_disputes" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payment_refunds" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_changes" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspace_payment_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "marketing_contact_submissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "company" TEXT,
    "reason" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "consent_at" TIMESTAMPTZ(6) NOT NULL,
    "client_hash" TEXT,
    "user_agent_hash" TEXT,
    "delivery_status" "lead_delivery_status" NOT NULL DEFAULT 'pending',
    "delivery_error" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "handled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marketing_contact_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_normalized" TEXT NOT NULL,
    "status" "newsletter_subscriber_status" NOT NULL DEFAULT 'pending_confirmation',
    "source" TEXT,
    "consent_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "unsubscribed_at" TIMESTAMPTZ(6),
    "client_hash" TEXT,
    "user_agent_hash" TEXT,
    "delivery_status" "lead_delivery_status" NOT NULL DEFAULT 'pending',
    "delivery_error" TEXT,
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_contact_submissions_created_at_idx" ON "marketing_contact_submissions"("created_at");

-- CreateIndex
CREATE INDEX "marketing_contact_submissions_delivery_status_created_at_idx" ON "marketing_contact_submissions"("delivery_status", "created_at");

-- CreateIndex
CREATE INDEX "marketing_contact_submissions_email_normalized_idx" ON "marketing_contact_submissions"("email_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_normalized_key" ON "newsletter_subscribers"("email_normalized");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_status_created_at_idx" ON "newsletter_subscribers"("status", "created_at");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_created_at_idx" ON "newsletter_subscribers"("created_at");

-- RenameIndex
ALTER INDEX "workspace_payment_accounts_status_charges_enabled_payouts_enabl" RENAME TO "workspace_payment_accounts_status_charges_enabled_payouts_e_idx";
