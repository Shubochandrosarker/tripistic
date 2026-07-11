-- CreateTable
CREATE TABLE "guide_profiles" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guide_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "waiver_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_versions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waiver_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waiver_signatures" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "waiver_version_id" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signature_image" TEXT NOT NULL,
    "signed_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waiver_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guide_profiles_workspace_id_member_id_key" ON "guide_profiles"("workspace_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_templates_workspace_id_key" ON "waiver_templates"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_templates_workspace_id_id_key" ON "waiver_templates"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "waiver_versions_workspace_id_template_id_idx" ON "waiver_versions"("workspace_id", "template_id");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_versions_workspace_id_template_id_version_number_key" ON "waiver_versions"("workspace_id", "template_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_versions_workspace_id_id_key" ON "waiver_versions"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "waiver_signatures_workspace_id_booking_id_idx" ON "waiver_signatures"("workspace_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "waiver_signatures_workspace_id_participant_id_key" ON "waiver_signatures"("workspace_id", "participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_participants_workspace_id_id_key" ON "booking_participants"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_id_key" ON "workspace_members"("workspace_id", "id");

-- AddForeignKey
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_workspace_id_guide_id_fkey" FOREIGN KEY ("workspace_id", "guide_id") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_profiles" ADD CONSTRAINT "guide_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guide_profiles" ADD CONSTRAINT "guide_profiles_workspace_id_member_id_fkey" FOREIGN KEY ("workspace_id", "member_id") REFERENCES "workspace_members"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_templates" ADD CONSTRAINT "waiver_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_workspace_id_template_id_fkey" FOREIGN KEY ("workspace_id", "template_id") REFERENCES "waiver_templates"("workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_versions" ADD CONSTRAINT "waiver_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_workspace_id_booking_id_fkey" FOREIGN KEY ("workspace_id", "booking_id") REFERENCES "bookings"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_workspace_id_participant_id_fkey" FOREIGN KEY ("workspace_id", "participant_id") REFERENCES "booking_participants"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiver_signatures" ADD CONSTRAINT "waiver_signatures_workspace_id_waiver_version_id_fkey" FOREIGN KEY ("workspace_id", "waiver_version_id") REFERENCES "waiver_versions"("workspace_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
