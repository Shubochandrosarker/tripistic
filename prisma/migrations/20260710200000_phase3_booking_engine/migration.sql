-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "booking_source" AS ENUM ('public_direct', 'manual');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tour_id" TEXT NOT NULL,
    "availability_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "public_token" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "source" "booking_source" NOT NULL DEFAULT 'public_direct',
    "status" "booking_status" NOT NULL DEFAULT 'pending',
    "guest_first_name" TEXT NOT NULL,
    "guest_last_name" TEXT NOT NULL,
    "guest_email" TEXT NOT NULL,
    "guest_phone" TEXT,
    "guest_notes" TEXT,
    "operator_notes" TEXT,
    "participant_count" INTEGER NOT NULL,
    "tour_title_snapshot" TEXT NOT NULL,
    "location_snapshot" TEXT,
    "meeting_point_snapshot" TEXT,
    "departure_starts_at" TIMESTAMPTZ(6) NOT NULL,
    "departure_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "addons_total" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "cancellation_policy_snapshot" TEXT,
    "terms_accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_participants" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_addon_selections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "tour_addon_id" TEXT,
    "name_snapshot" TEXT NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "total_price" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_addon_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_events" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_status" "booking_status",
    "to_status" "booking_status" NOT NULL,
    "actor_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_public_token_key" ON "bookings"("public_token");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_status_created_at_idx" ON "bookings"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "bookings_availability_id_status_idx" ON "bookings"("availability_id", "status");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_guest_email_idx" ON "bookings"("workspace_id", "guest_email");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_tour_id_idx" ON "bookings"("workspace_id", "tour_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_workspace_id_reference_key" ON "bookings"("workspace_id", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_workspace_id_idempotency_key_key" ON "bookings"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_workspace_id_id_key" ON "bookings"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "booking_participants_workspace_id_booking_id_idx" ON "booking_participants"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_addon_selections_workspace_id_booking_id_idx" ON "booking_addon_selections"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_addon_selections_tour_addon_id_idx" ON "booking_addon_selections"("tour_addon_id");

-- CreateIndex
CREATE INDEX "booking_status_events_workspace_id_booking_id_created_at_idx" ON "booking_status_events"("workspace_id", "booking_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "availabilities_workspace_id_id_key" ON "availabilities"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tours_workspace_id_id_key" ON "tours"("workspace_id", "id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_tour_id_fkey" FOREIGN KEY ("workspace_id", "tour_id") REFERENCES "tours"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_availability_id_fkey" FOREIGN KEY ("workspace_id", "availability_id") REFERENCES "availabilities"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_participants" ADD CONSTRAINT "booking_participants_workspace_id_booking_id_fkey" FOREIGN KEY ("workspace_id", "booking_id") REFERENCES "bookings"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_addon_selections" ADD CONSTRAINT "booking_addon_selections_workspace_id_booking_id_fkey" FOREIGN KEY ("workspace_id", "booking_id") REFERENCES "bookings"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_addon_selections" ADD CONSTRAINT "booking_addon_selections_tour_addon_id_fkey" FOREIGN KEY ("tour_addon_id") REFERENCES "tour_addons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_workspace_id_booking_id_fkey" FOREIGN KEY ("workspace_id", "booking_id") REFERENCES "bookings"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_events" ADD CONSTRAINT "booking_status_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

