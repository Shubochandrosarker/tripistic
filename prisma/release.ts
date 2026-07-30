/**
 * Release job — the single gate a deployment passes through before the app
 * serves traffic.
 *
 * Ordering: wait for PostgreSQL → `prisma migrate deploy` → seed the canonical
 * plan catalog → backfill subscriptions for workspaces missing one → exit 0.
 *
 * Why this exists. Deployments previously ran migrations automatically but
 * kept seeding behind a Compose profile (`--profile tools`), which does not
 * start with `docker compose up`. A fresh production deploy therefore created
 * the `plans` table and left it empty. The blast radius of that was not a
 * cosmetic gap: `/dashboard/billing` rendered an empty grid, workspace
 * creation skipped the subscription entirely, and every entitlement gate
 * rejected with 409 — so the product looked broken from the first signup.
 *
 * Runs in the `tooling` image, which has Prisma and tsx. The application
 * image stays minimal and non-root, and never needs them.
 *
 * Idempotent throughout, because a release job is re-run on every deploy and
 * may be retried after a partial failure.
 */
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

import { backfillMissingSubscriptions } from "../lib/plans/backfill";
import { checkStripePriceConfig, describePriceConfig } from "../lib/billing/config-check";

const prisma = new PrismaClient();

function log(message: string) {
  console.log(`[release] ${message}`);
}

function run(label: string, command: string, args: string[]) {
  log(label);
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

/**
 * Blocks until the database answers.
 *
 * Compose health checks already gate this service on `service_healthy`, but a
 * healthy Postgres container is not the same as an accepting connection under
 * load, and this job must not fail a deploy over a few seconds of startup.
 */
async function waitForDatabase(attempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      log(`database reachable (attempt ${attempt})`);
      return;
    } catch (error) {
      if (attempt === attempts) {
        throw new Error(
          `database unreachable after ${attempts} attempts: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main() {
  log("starting");

  await waitForDatabase();

  run("applying migrations", "npx", ["prisma", "migrate", "deploy"]);

  // Seeding is now part of the release, not an optional manual step.
  run("seeding plan catalog", "npx", ["tsx", "prisma/seed.ts"]);

  log("backfilling subscriptions");
  const backfill = await backfillMissingSubscriptions(prisma, { log });
  if (backfill.missingDefaultPlan) {
    // The seed above should have created it; if it did not, the app would
    // start into the exact broken state this job exists to prevent.
    throw new Error("default plan missing after seed — refusing to release");
  }

  // Stripe price configuration is reported here rather than enforced, because
  // the app is genuinely usable without self-serve checkout — bookings,
  // operations and guest payments all work. Failing the deploy over it would
  // block environments that legitimately do not sell subscriptions.
  //
  // In production it is escalated to a loud warning, because the alternative
  // is a customer discovering it at the Subscribe button.
  const seeded = await prisma.planPrice.findMany({
    where: { isActive: true, providerPriceId: { not: null } },
    select: { interval: true, plan: { select: { slug: true } } },
  });
  const seededKeys = new Set(seeded.map((row) => `${row.plan.slug}:${row.interval}`));
  const priceReport = checkStripePriceConfig(process.env, seededKeys);

  if (priceReport.ok) {
    log(describePriceConfig(priceReport));
  } else if (process.env.NODE_ENV === "production") {
    log("WARNING — self-serve subscription checkout is NOT configured:");
    for (const line of describePriceConfig(priceReport).split("\n")) log(line);
  } else {
    log(describePriceConfig(priceReport).split("\n")[0]);
  }

  log(
    `complete — ${backfill.created} subscription(s) backfilled, ${backfill.scanned} workspace(s) scanned`,
  );
}

main()
  .catch((error) => {
    console.error("[release] FAILED:", error instanceof Error ? error.message : error);
    // Non-zero exit stops the deploy: Compose gates the app on
    // `service_completed_successfully`, so the app will not start.
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
