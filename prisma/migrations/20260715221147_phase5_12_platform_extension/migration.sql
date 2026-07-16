-- CreateEnum
CREATE TYPE "company_kind" AS ENUM ('travel_agent', 'hotel', 'partner', 'other');

-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost');

-- CreateEnum
CREATE TYPE "crm_task_status" AS ENUM ('open', 'done');

-- CreateEnum
CREATE TYPE "crm_activity_type" AS ENUM ('note', 'call', 'email', 'whatsapp', 'sms', 'meeting', 'status_change');

-- CreateEnum
CREATE TYPE "guide_kind" AS ENUM ('guide', 'driver', 'both');

-- CreateEnum
CREATE TYPE "staff_employment_type" AS ENUM ('employee', 'freelancer', 'contractor');

-- CreateEnum
CREATE TYPE "time_off_status" AS ENUM ('requested', 'approved', 'declined');

-- CreateEnum
CREATE TYPE "vehicle_type" AS ENUM ('car', 'van', 'minibus', 'bus', 'boat', 'other');

-- CreateEnum
CREATE TYPE "vehicle_status" AS ENUM ('active', 'maintenance', 'retired');

-- CreateEnum
CREATE TYPE "maintenance_type" AS ENUM ('service', 'repair', 'inspection');

-- CreateEnum
CREATE TYPE "ops_status" AS ENUM ('scheduled', 'boarding', 'in_progress', 'delayed', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ops_event_type" AS ENUM ('status_changed', 'note', 'delay_reported', 'checkin', 'incident_reported', 'route_changed', 'customer_notified');

-- CreateEnum
CREATE TYPE "incident_severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "incident_category" AS ENUM ('medical', 'vehicle', 'weather', 'guest_behavior', 'other');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('open', 'investigating', 'resolved');

-- CreateEnum
CREATE TYPE "vendor_kind" AS ENUM ('hotel', 'restaurant', 'transport', 'activity_provider', 'other');

-- CreateEnum
CREATE TYPE "vendor_invoice_status" AS ENUM ('unpaid', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "itinerary_status" AS ENUM ('draft', 'shared', 'confirmed', 'archived');

-- CreateEnum
CREATE TYPE "itinerary_item_type" AS ENUM ('accommodation', 'meal', 'activity', 'transfer', 'flight', 'guide', 'vehicle', 'other');

-- AlterTable
ALTER TABLE "availabilities" ADD COLUMN     "delay_minutes" INTEGER,
ADD COLUMN     "driver_id" TEXT,
ADD COLUMN     "ops_status" "ops_status" NOT NULL DEFAULT 'scheduled',
ADD COLUMN     "ops_updated_at" TIMESTAMPTZ(6),
ADD COLUMN     "vehicle_id" TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "checked_in_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "company_id" TEXT;

-- AlterTable
ALTER TABLE "guide_profiles" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "employment_type" "staff_employment_type" NOT NULL DEFAULT 'employee',
ADD COLUMN     "hourly_rate_cents" INTEGER,
ADD COLUMN     "kind" "guide_kind" NOT NULL DEFAULT 'guide',
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "skills" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "company_kind" NOT NULL DEFAULT 'other',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "country" TEXT,
    "commission_rate_bps" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company_id" TEXT,
    "source" TEXT,
    "status" "lead_status" NOT NULL DEFAULT 'new',
    "estimated_value_cents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "converted_customer_id" TEXT,
    "assigned_to" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "status" "crm_task_status" NOT NULL DEFAULT 'open',
    "completed_at" TIMESTAMPTZ(6),
    "customer_id" TEXT,
    "lead_id" TEXT,
    "assigned_to" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "type" "crm_activity_type" NOT NULL DEFAULT 'note',
    "subject" TEXT,
    "body" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_time_off" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" TEXT,
    "status" "time_off_status" NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_time_entries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "availability_id" TEXT,
    "worked_on" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "role" TEXT,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_ratings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "availability_id" TEXT,
    "rating_value" INTEGER NOT NULL,
    "comment" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guide_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "vehicle_type" NOT NULL DEFAULT 'car',
    "license_plate" TEXT,
    "capacity" INTEGER NOT NULL,
    "status" "vehicle_status" NOT NULL DEFAULT 'active',
    "odometer" INTEGER,
    "fuel_type" TEXT,
    "insurance_expires_on" DATE,
    "registration_expires_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_maintenance_records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" "maintenance_type" NOT NULL DEFAULT 'service',
    "performed_on" DATE NOT NULL,
    "odometer" INTEGER,
    "cost_cents" INTEGER,
    "vendor_name" TEXT,
    "notes" TEXT,
    "next_due_on" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_fuel_logs" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "logged_on" DATE NOT NULL,
    "cost_cents" INTEGER NOT NULL,
    "odometer" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_fuel_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "availability_id" TEXT NOT NULL,
    "type" "ops_event_type" NOT NULL,
    "from_status" "ops_status",
    "to_status" "ops_status",
    "message" TEXT,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ops_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_reports" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "availability_id" TEXT,
    "severity" "incident_severity" NOT NULL DEFAULT 'medium',
    "category" "incident_category" NOT NULL DEFAULT 'other',
    "status" "incident_status" NOT NULL DEFAULT 'open',
    "description" TEXT NOT NULL,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "reported_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "vendor_kind" NOT NULL DEFAULT 'other',
    "contact_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "commission_rate_bps" INTEGER,
    "rating" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_invoices" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "invoice_number" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issued_on" DATE NOT NULL,
    "due_on" DATE,
    "status" "vendor_invoice_status" NOT NULL DEFAULT 'unpaid',
    "paid_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itineraries" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "destination" TEXT,
    "day_count" INTEGER NOT NULL,
    "start_date" DATE,
    "traveler_count" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "itinerary_status" NOT NULL DEFAULT 'draft',
    "customer_id" TEXT,
    "lead_id" TEXT,
    "public_token" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_days" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "itinerary_id" TEXT NOT NULL,
    "day_number" INTEGER NOT NULL,
    "date" DATE,
    "title" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "itinerary_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "itinerary_id" TEXT NOT NULL,
    "itinerary_day_id" TEXT NOT NULL,
    "type" "itinerary_item_type" NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" TEXT,
    "tour_id" TEXT,
    "vendor_id" TEXT,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "price_cents" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itinerary_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "itinerary_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itinerary_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_workspace_id_kind_idx" ON "companies"("workspace_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "companies_workspace_id_id_key" ON "companies"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "leads_workspace_id_status_idx" ON "leads"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "leads_workspace_id_company_id_idx" ON "leads"("workspace_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "leads_workspace_id_id_key" ON "leads"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "crm_tasks_workspace_id_status_due_at_idx" ON "crm_tasks"("workspace_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "crm_tasks_workspace_id_customer_id_idx" ON "crm_tasks"("workspace_id", "customer_id");

-- CreateIndex
CREATE INDEX "crm_tasks_workspace_id_lead_id_idx" ON "crm_tasks"("workspace_id", "lead_id");

-- CreateIndex
CREATE INDEX "crm_tasks_workspace_id_assigned_to_idx" ON "crm_tasks"("workspace_id", "assigned_to");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tasks_workspace_id_id_key" ON "crm_tasks"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "crm_activities_workspace_id_customer_id_occurred_at_idx" ON "crm_activities"("workspace_id", "customer_id", "occurred_at");

-- CreateIndex
CREATE INDEX "crm_activities_workspace_id_lead_id_occurred_at_idx" ON "crm_activities"("workspace_id", "lead_id", "occurred_at");

-- CreateIndex
CREATE INDEX "staff_time_off_workspace_id_member_id_starts_on_idx" ON "staff_time_off"("workspace_id", "member_id", "starts_on");

-- CreateIndex
CREATE INDEX "staff_time_entries_workspace_id_member_id_worked_on_idx" ON "staff_time_entries"("workspace_id", "member_id", "worked_on");

-- CreateIndex
CREATE INDEX "staff_time_entries_workspace_id_availability_id_idx" ON "staff_time_entries"("workspace_id", "availability_id");

-- CreateIndex
CREATE INDEX "guide_ratings_workspace_id_member_id_idx" ON "guide_ratings"("workspace_id", "member_id");

-- CreateIndex
CREATE INDEX "guide_ratings_workspace_id_availability_id_idx" ON "guide_ratings"("workspace_id", "availability_id");

-- CreateIndex
CREATE INDEX "vehicles_workspace_id_status_idx" ON "vehicles"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_workspace_id_id_key" ON "vehicles"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "vehicle_maintenance_records_workspace_id_vehicle_id_perform_idx" ON "vehicle_maintenance_records"("workspace_id", "vehicle_id", "performed_on");

-- CreateIndex
CREATE INDEX "vehicle_fuel_logs_workspace_id_vehicle_id_logged_on_idx" ON "vehicle_fuel_logs"("workspace_id", "vehicle_id", "logged_on");

-- CreateIndex
CREATE INDEX "ops_events_workspace_id_availability_id_created_at_idx" ON "ops_events"("workspace_id", "availability_id", "created_at");

-- CreateIndex
CREATE INDEX "incident_reports_workspace_id_status_created_at_idx" ON "incident_reports"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "incident_reports_workspace_id_availability_id_idx" ON "incident_reports"("workspace_id", "availability_id");

-- CreateIndex
CREATE INDEX "vendors_workspace_id_kind_idx" ON "vendors"("workspace_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_workspace_id_id_key" ON "vendors"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "vendor_invoices_workspace_id_vendor_id_idx" ON "vendor_invoices"("workspace_id", "vendor_id");

-- CreateIndex
CREATE INDEX "vendor_invoices_workspace_id_status_due_on_idx" ON "vendor_invoices"("workspace_id", "status", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "itineraries_public_token_key" ON "itineraries"("public_token");

-- CreateIndex
CREATE INDEX "itineraries_workspace_id_status_idx" ON "itineraries"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "itineraries_workspace_id_customer_id_idx" ON "itineraries"("workspace_id", "customer_id");

-- CreateIndex
CREATE INDEX "itineraries_workspace_id_lead_id_idx" ON "itineraries"("workspace_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "itineraries_workspace_id_id_key" ON "itineraries"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "itinerary_days_workspace_id_itinerary_id_idx" ON "itinerary_days"("workspace_id", "itinerary_id");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_days_workspace_id_itinerary_id_day_number_key" ON "itinerary_days"("workspace_id", "itinerary_id", "day_number");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_days_workspace_id_id_key" ON "itinerary_days"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "itinerary_items_workspace_id_itinerary_id_sort_order_idx" ON "itinerary_items"("workspace_id", "itinerary_id", "sort_order");

-- CreateIndex
CREATE INDEX "itinerary_items_workspace_id_itinerary_day_id_idx" ON "itinerary_items"("workspace_id", "itinerary_day_id");

-- CreateIndex
CREATE UNIQUE INDEX "itinerary_versions_workspace_id_itinerary_id_version_number_key" ON "itinerary_versions"("workspace_id", "itinerary_id", "version_number");

-- CreateIndex
CREATE INDEX "availabilities_workspace_id_ops_status_starts_at_idx" ON "availabilities"("workspace_id", "ops_status", "starts_at");

-- CreateIndex
CREATE INDEX "customers_workspace_id_company_id_idx" ON "customers"("workspace_id", "company_id");

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_workspace_id_driver_id_fkey" FOREIGN KEY ("workspace_id", "driver_id") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_workspace_id_vehicle_id_fkey" FOREIGN KEY ("workspace_id", "vehicle_id") REFERENCES "vehicles"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_company_id_fkey" FOREIGN KEY ("workspace_id", "company_id") REFERENCES "companies"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_company_id_fkey" FOREIGN KEY ("workspace_id", "company_id") REFERENCES "companies"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_converted_customer_id_fkey" FOREIGN KEY ("workspace_id", "converted_customer_id") REFERENCES "customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_assigned_to_fkey" FOREIGN KEY ("workspace_id", "assigned_to") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_workspace_id_assigned_to_fkey" FOREIGN KEY ("workspace_id", "assigned_to") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_workspace_id_member_id_fkey" FOREIGN KEY ("workspace_id", "member_id") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_entries" ADD CONSTRAINT "staff_time_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_entries" ADD CONSTRAINT "staff_time_entries_workspace_id_member_id_fkey" FOREIGN KEY ("workspace_id", "member_id") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_entries" ADD CONSTRAINT "staff_time_entries_workspace_id_availability_id_fkey" FOREIGN KEY ("workspace_id", "availability_id") REFERENCES "availabilities"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_entries" ADD CONSTRAINT "staff_time_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_ratings" ADD CONSTRAINT "guide_ratings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_ratings" ADD CONSTRAINT "guide_ratings_workspace_id_member_id_fkey" FOREIGN KEY ("workspace_id", "member_id") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_ratings" ADD CONSTRAINT "guide_ratings_workspace_id_availability_id_fkey" FOREIGN KEY ("workspace_id", "availability_id") REFERENCES "availabilities"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_ratings" ADD CONSTRAINT "guide_ratings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_maintenance_records" ADD CONSTRAINT "vehicle_maintenance_records_workspace_id_vehicle_id_fkey" FOREIGN KEY ("workspace_id", "vehicle_id") REFERENCES "vehicles"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fuel_logs" ADD CONSTRAINT "vehicle_fuel_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_fuel_logs" ADD CONSTRAINT "vehicle_fuel_logs_workspace_id_vehicle_id_fkey" FOREIGN KEY ("workspace_id", "vehicle_id") REFERENCES "vehicles"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_workspace_id_availability_id_fkey" FOREIGN KEY ("workspace_id", "availability_id") REFERENCES "availabilities"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ops_events" ADD CONSTRAINT "ops_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_workspace_id_availability_id_fkey" FOREIGN KEY ("workspace_id", "availability_id") REFERENCES "availabilities"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_invoices" ADD CONSTRAINT "vendor_invoices_workspace_id_vendor_id_fkey" FOREIGN KEY ("workspace_id", "vendor_id") REFERENCES "vendors"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_workspace_id_customer_id_fkey" FOREIGN KEY ("workspace_id", "customer_id") REFERENCES "customers"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_workspace_id_lead_id_fkey" FOREIGN KEY ("workspace_id", "lead_id") REFERENCES "leads"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_workspace_id_itinerary_id_fkey" FOREIGN KEY ("workspace_id", "itinerary_id") REFERENCES "itineraries"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_workspace_id_itinerary_id_fkey" FOREIGN KEY ("workspace_id", "itinerary_id") REFERENCES "itineraries"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_workspace_id_itinerary_day_id_fkey" FOREIGN KEY ("workspace_id", "itinerary_day_id") REFERENCES "itinerary_days"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_workspace_id_tour_id_fkey" FOREIGN KEY ("workspace_id", "tour_id") REFERENCES "tours"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_workspace_id_vendor_id_fkey" FOREIGN KEY ("workspace_id", "vendor_id") REFERENCES "vendors"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_workspace_id_itinerary_id_fkey" FOREIGN KEY ("workspace_id", "itinerary_id") REFERENCES "itineraries"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
