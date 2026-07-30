import { createHash, timingSafeEqual } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db";

/**
 * Scheduled-job runner.
 *
 * The gap this closes: the application shipped seven classes of recurring
 * work — payment expiry, reminders, domain reconciliation, trial and grace
 * expiry, email retries, host-cache invalidation, token cleanup — and no
 * scheduler at all. The code existed and was correct; nothing ever called it.
 * The most damaging consequence was that abandoned checkouts held their seats
 * forever, so departures silently sold out to bookings that were never paid.
 *
 * Two entry points, matching the two ways this needs to be driven:
 *   - `POST /api/jobs/run` with the cron secret, for an external scheduler;
 *   - `npm run jobs:run <name>`, for a worker container or manual operation.
 *
 * Neither requires an interactive platform-admin session. That was the flaw
 * in the previous trigger routes: `expire-pending` and `messages/sweep` were
 * gated by `requirePlatformAdminApi()`, so a headless cron could not call
 * them even if one had existed.
 */

export type JobResult = Record<string, number | string | boolean>;

export type JobDefinition = {
  name: string;
  description: string;
  run: () => Promise<JobResult>;
};

export type JobOutcome = {
  jobName: string;
  status: "succeeded" | "failed" | "skipped";
  durationMs: number;
  result?: JobResult;
  error?: string;
};

/**
 * Stable 64-bit key for a PostgreSQL advisory lock, derived from the job name.
 *
 * Advisory locks are used rather than a status row because they are released
 * automatically when the session ends. A worker killed mid-run therefore
 * frees its lock, where a "running" row would strand the job forever and
 * require manual intervention.
 */
export function advisoryLockKey(jobName: string): bigint {
  const digest = createHash("sha256").update(jobName).digest();
  // Signed 64-bit: pg_try_advisory_lock takes a bigint.
  return digest.readBigInt64BE(0);
}

/**
 * Appends `connection_limit=1` to a Postgres URL.
 *
 * Exported for testing; see `lockClient()` for why a pool of one is required.
 */
export function singleConnectionUrl(base: string): string {
  try {
    const url = new URL(base);
    url.searchParams.set("connection_limit", "1");
    return url.toString();
  } catch {
    // Not a parseable URL (e.g. a socket path). Fall back to the raw value —
    // worst case we get the shared pool behaviour, which `runJob` detects.
    return base;
  }
}

let lockClientInstance: PrismaClient | undefined;

/**
 * A dedicated Prisma client with a pool of exactly one connection, used only
 * for the advisory lock statements.
 *
 * `pg_try_advisory_lock` takes a *session*-scoped lock: it belongs to the
 * connection that issued it and only that connection can release it. The
 * application's shared `prisma` client pools several connections and hands out
 * whichever is free per query, so `SELECT pg_try_advisory_lock(...)` and the
 * matching `pg_advisory_unlock(...)` are not guaranteed to land on the same
 * one. When they diverge, the unlock is a no-op that returns false and the
 * lock survives until that connection is recycled — which, for a long-lived
 * server, means the job never runs again. Silent permanent stoppage is exactly
 * the failure mode this whole phase exists to remove, so the lock statements
 * get a client that physically cannot pick a different connection.
 *
 * The transaction-scoped variant (`pg_try_advisory_xact_lock`) would also pin
 * correctly, but it would require wrapping every job body in one long
 * transaction — and the sweeps deliberately open a transaction per booking so
 * one failure cannot roll back another's work.
 */
function lockClient(): PrismaClient {
  if (!lockClientInstance) {
    const base = process.env.DATABASE_URL;
    lockClientInstance = new PrismaClient({
      log: ["error"],
      ...(base ? { datasourceUrl: singleConnectionUrl(base) } : {}),
    });
  }
  return lockClientInstance;
}

/** Releases the lock connection. Call from a worker before exiting. */
export async function disconnectJobRunner(): Promise<void> {
  if (lockClientInstance) {
    await lockClientInstance.$disconnect();
    lockClientInstance = undefined;
  }
}

/** Constant-time secret comparison — a plain `!==` leaks length and prefix via timing. */
export function verifyCronSecret(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Runs a job under an advisory lock, recording the outcome.
 *
 * If another instance holds the lock the run is skipped, not queued: these
 * are idempotent sweeps, so the next tick picks up whatever was missed. That
 * is the correct behaviour for a cron-style workload and avoids two workers
 * doing the same scan concurrently.
 */
export async function runJob(
  job: JobDefinition,
  options: { triggeredBy?: string } = {},
): Promise<JobOutcome> {
  const startedAt = Date.now();
  const lockKey = advisoryLockKey(job.name);
  const locks = lockClient();

  // Session-scoped lock: held until explicitly released or the connection
  // drops, which is what makes worker death safe.
  const [{ locked }] = await locks.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockKey}::bigint) AS locked
  `;

  if (!locked) {
    await prisma.jobRun.create({
      data: {
        jobName: job.name,
        status: "skipped",
        finishedAt: new Date(),
        durationMs: 0,
        lockSkipped: true,
        triggeredBy: options.triggeredBy ?? "schedule",
        result: { skipped: "another instance holds the lock" },
      },
    });
    return { jobName: job.name, status: "skipped", durationMs: 0 };
  }

  const run = await prisma.jobRun.create({
    data: { jobName: job.name, triggeredBy: options.triggeredBy ?? "schedule" },
  });

  try {
    const result = await job.run();
    const durationMs = Date.now() - startedAt;
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "succeeded", finishedAt: new Date(), durationMs, result },
    });
    return { jobName: job.name, status: "succeeded", durationMs, result };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "failed", finishedAt: new Date(), durationMs, error: message },
    });
    return { jobName: job.name, status: "failed", durationMs, error: message };
  } finally {
    // Must go through the same client that took the lock. A `false` result
    // means the release did not happen — surface it rather than letting the
    // job quietly stop running from the next tick onward.
    const [{ released }] = await locks.$queryRaw<{ released: boolean }[]>`
      SELECT pg_advisory_unlock(${lockKey}::bigint) AS released
    `;
    if (!released) {
      console.error(`[jobs] failed to release advisory lock for ${job.name}`);
    }
  }
}
