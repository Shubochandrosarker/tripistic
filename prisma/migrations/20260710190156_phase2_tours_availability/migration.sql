-- CreateEnum
CREATE TYPE "tour_kind" AS ENUM ('tour', 'activity', 'package');

-- CreateEnum
CREATE TYPE "tour_status" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "tour_visibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "schedule_status" AS ENUM ('active', 'paused');

-- CreateEnum
CREATE TYPE "availability_status" AS ENUM ('scheduled', 'cancelled');

-- CreateTable
CREATE TABLE "tours" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "tour_kind" NOT NULL DEFAULT 'tour',
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL,
    "duration_days" INTEGER,
    "location" TEXT,
    "meeting_point" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "base_price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "visibility" "tour_visibility" NOT NULL DEFAULT 'public',
    "status" "tour_status" NOT NULL DEFAULT 'draft',
    "cancellation_policy" TEXT,
    "cancellation_notice_hours" INTEGER,
    "waiver_required" BOOLEAN NOT NULL DEFAULT false,
    "cover_image_url" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_addons" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "max_per_booking" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tour_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_schedules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "name" TEXT,
    "days_of_week" INTEGER[],
    "start_time" TEXT NOT NULL,
    "duration_minutes" INTEGER,
    "capacity" INTEGER,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "status" "schedule_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tour_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availabilities" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked_count" INTEGER NOT NULL DEFAULT 0,
    "price_override" INTEGER,
    "guide_id" TEXT,
    "status" "availability_status" NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blackout_dates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tour_id" TEXT,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blackout_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tours_workspace_id_status_idx" ON "tours"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tours_workspace_id_slug_key" ON "tours"("workspace_id", "slug");

-- CreateIndex
CREATE INDEX "tour_addons_workspace_id_idx" ON "tour_addons"("workspace_id");

-- CreateIndex
CREATE INDEX "tour_addons_tour_id_idx" ON "tour_addons"("tour_id");

-- CreateIndex
CREATE INDEX "tour_schedules_workspace_id_idx" ON "tour_schedules"("workspace_id");

-- CreateIndex
CREATE INDEX "tour_schedules_tour_id_idx" ON "tour_schedules"("tour_id");

-- CreateIndex
CREATE INDEX "availabilities_workspace_id_starts_at_idx" ON "availabilities"("workspace_id", "starts_at");

-- CreateIndex
CREATE INDEX "availabilities_tour_id_starts_at_idx" ON "availabilities"("tour_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "availabilities_tour_id_starts_at_key" ON "availabilities"("tour_id", "starts_at");

-- CreateIndex
CREATE INDEX "blackout_dates_workspace_id_idx" ON "blackout_dates"("workspace_id");

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tours" ADD CONSTRAINT "tours_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_addons" ADD CONSTRAINT "tour_addons_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_addons" ADD CONSTRAINT "tour_addons_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_schedules" ADD CONSTRAINT "tour_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_schedules" ADD CONSTRAINT "tour_schedules_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "tour_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackout_dates" ADD CONSTRAINT "blackout_dates_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;
