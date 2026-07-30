/**
 * Worker entry point for scheduled jobs.
 *
 * The alternative to the HTTP route, for a worker container or a cron line on
 * the host. Needs no secret and no running app — it talks to the database
 * directly, so it cannot be reached from the internet at all.
 *
 *   npm run jobs:run                          # every job
 *   npm run jobs:run payments.expire-pending  # one job
 *   npm run jobs:list
 */
import { JOBS, findJob, jobNames } from "../lib/jobs/registry";
import { disconnectJobRunner, runJob } from "../lib/jobs/runner";
import { prisma } from "../lib/db";

async function main() {
  const [, , command, ...rest] = process.argv;

  if (command === "--list" || command === "list") {
    for (const job of JOBS) console.log(`${job.name.padEnd(32)} ${job.description}`);
    return;
  }

  const requested = command && !command.startsWith("--") ? [command, ...rest] : jobNames();
  let failures = 0;

  for (const name of requested) {
    const job = findJob(name);
    if (!job) {
      console.error(`[jobs] unknown job "${name}". Known: ${jobNames().join(", ")}`);
      failures += 1;
      continue;
    }

    const outcome = await runJob(job, { triggeredBy: "worker" });
    const detail = outcome.result ? JSON.stringify(outcome.result) : (outcome.error ?? "");
    console.log(`[jobs] ${outcome.jobName} ${outcome.status} ${outcome.durationMs}ms ${detail}`);
    if (outcome.status === "failed") failures += 1;
  }

  // Non-zero on failure so a cron wrapper or supervisor can alert.
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[jobs] FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectJobRunner();
    await prisma.$disconnect();
  });
