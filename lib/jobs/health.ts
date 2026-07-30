import { prisma } from "@/lib/db";
import { JOBS } from "@/lib/jobs/registry";

/**
 * Real scheduler state for the admin health page.
 *
 * That page previously rendered `<StatusBadge status="manual" />` and
 * `status="ready"` as literals — they described intent, not reality, and
 * would have kept saying "ready" while the worker was down. Everything here
 * is derived from `job_runs`.
 */

export type JobHealth = {
  name: string;
  description: string;
  lastRunAt: Date | null;
  lastStatus: "running" | "succeeded" | "failed" | "skipped" | null;
  lastDurationMs: number | null;
  lastError: string | null;
  /** Consecutive `skipped` runs, newest first — a leaked lock looks like this. */
  consecutiveSkips: number;
  state: "healthy" | "degraded" | "stalled" | "never_run";
};

/**
 * How stale a job's last run may be before it counts as stalled.
 *
 * The worker ticks every 60s, so anything beyond an hour means it is not
 * running — generous enough that a slow tick or a restart does not raise a
 * false alarm.
 */
export const STALL_THRESHOLD_MS = 60 * 60 * 1000;

/** Consecutive skips that suggest a lock leaked rather than ordinary overlap. */
export const SKIP_ALARM_THRESHOLD = 5;

export function classifyJob(
  input: {
    lastRunAt: Date | null;
    lastStatus: JobHealth["lastStatus"];
    consecutiveSkips: number;
  },
  now: Date = new Date(),
): JobHealth["state"] {
  if (!input.lastRunAt || !input.lastStatus) return "never_run";
  if (input.lastStatus === "failed") return "degraded";
  // Every recent tick skipped means nothing is actually being done, even
  // though each individual run "succeeded" in the loosest sense. This is what
  // a leaked advisory lock looks like from the outside, and it is precisely
  // the failure the `skipped` status exists to make visible.
  if (input.consecutiveSkips >= SKIP_ALARM_THRESHOLD) return "degraded";
  if (now.getTime() - input.lastRunAt.getTime() > STALL_THRESHOLD_MS) return "stalled";
  return "healthy";
}

export async function getJobHealth(now: Date = new Date()): Promise<JobHealth[]> {
  const recent = await prisma.jobRun.findMany({
    where: { jobName: { in: JOBS.map((job) => job.name) } },
    orderBy: { startedAt: "desc" },
    // Enough history per job to see a run of skips without loading the table.
    take: JOBS.length * (SKIP_ALARM_THRESHOLD + 3),
    select: {
      jobName: true,
      status: true,
      startedAt: true,
      durationMs: true,
      error: true,
      lockSkipped: true,
    },
  });

  const byJob = new Map<string, typeof recent>();
  for (const run of recent) {
    const list = byJob.get(run.jobName) ?? [];
    list.push(run);
    byJob.set(run.jobName, list);
  }

  return JOBS.map((job) => {
    const runs = byJob.get(job.name) ?? [];
    const last = runs[0];

    let consecutiveSkips = 0;
    for (const run of runs) {
      if (run.status === "skipped" || run.lockSkipped) consecutiveSkips += 1;
      else break;
    }

    const lastRunAt = last?.startedAt ?? null;
    const lastStatus = last?.status ?? null;

    return {
      name: job.name,
      description: job.description,
      lastRunAt,
      lastStatus,
      lastDurationMs: last?.durationMs ?? null,
      lastError: last?.error ?? null,
      consecutiveSkips,
      state: classifyJob({ lastRunAt, lastStatus, consecutiveSkips }, now),
    };
  });
}

/** Worst state across all jobs, for a single top-level indicator. */
export function overallJobState(jobs: JobHealth[]): JobHealth["state"] {
  if (jobs.some((job) => job.state === "degraded")) return "degraded";
  if (jobs.some((job) => job.state === "stalled")) return "stalled";
  if (jobs.every((job) => job.state === "never_run")) return "never_run";
  return "healthy";
}
