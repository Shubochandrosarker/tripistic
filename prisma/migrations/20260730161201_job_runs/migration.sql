-- CreateEnum
CREATE TYPE "job_run_status" AS ENUM ('running', 'succeeded', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "status" "job_run_status" NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "result" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "lock_skipped" BOOLEAN NOT NULL DEFAULT false,
    "triggered_by" TEXT NOT NULL DEFAULT 'schedule',

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_job_name_started_at_idx" ON "job_runs"("job_name", "started_at");

-- CreateIndex
CREATE INDEX "job_runs_status_started_at_idx" ON "job_runs"("status", "started_at");
