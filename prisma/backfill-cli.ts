/**
 * Standalone subscription backfill.
 *
 * The release job runs this automatically; this entry point exists for
 * operating an already-deployed environment — checking what a backfill would
 * do before running one, or repairing a specific incident without a redeploy.
 *
 *   npm run db:backfill -- --dry-run
 *   npm run db:backfill
 */
import { PrismaClient } from "@prisma/client";

import { backfillMissingSubscriptions } from "../lib/plans/backfill";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (dryRun) console.log("[backfill] dry run — no writes will be made");
  const result = await backfillMissingSubscriptions(prisma, {
    dryRun,
    log: (message) => console.log(`[backfill] ${message.replace(/^backfill: /, "")}`),
  });

  if (result.missingDefaultPlan) {
    console.error("[backfill] default plan missing — run `npm run db:seed` first");
    process.exitCode = 1;
    return;
  }

  console.log(
    `[backfill] scanned ${result.scanned}, ${dryRun ? "would create" : "created"} ${result.created}, skipped ${result.skipped}`,
  );
}

main()
  .catch((error) => {
    console.error("[backfill] FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
