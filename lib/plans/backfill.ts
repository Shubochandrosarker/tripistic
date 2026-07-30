import type { PrismaClient } from "@prisma/client";

import { DEFAULT_PLAN_SLUG, TRIAL_DAYS } from "@/lib/constants";

/**
 * Subscription backfill for workspaces created without one.
 *
 * `POST /api/workspaces` attaches the default plan only `if (defaultPlan)`
 * — a deliberate concession so the app can boot before the catalog is seeded.
 * The consequence is that any workspace created while `plans` was empty is
 * permanently subscription-less, and every entitlement gate calls
 * `requireSubscription`, which rejects with 409. Those workspaces cannot
 * activate a tour, invite a member, or add a domain, and nothing in the
 * product repairs them.
 *
 * This runs as part of the release job, after the seed, so the catalog it
 * needs is guaranteed to exist by the time it executes.
 *
 * Idempotent by construction: it only ever touches workspaces that have no
 * subscription row at all, so re-running is a no-op.
 */

export type BackfillResult = {
  scanned: number;
  created: number;
  skipped: number;
  /** Set when the default plan is missing — nothing is created in that case. */
  missingDefaultPlan: boolean;
};

export type BackfillOptions = {
  /** Report what would change without writing. */
  dryRun?: boolean;
  log?: (message: string) => void;
};

export async function backfillMissingSubscriptions(
  prisma: PrismaClient,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const log = options.log ?? (() => {});
  const dryRun = options.dryRun ?? false;

  const defaultPlan = await prisma.plan.findUnique({ where: { slug: DEFAULT_PLAN_SLUG } });
  if (!defaultPlan) {
    log(`backfill: default plan "${DEFAULT_PLAN_SLUG}" not found — nothing to do`);
    return { scanned: 0, created: 0, skipped: 0, missingDefaultPlan: true };
  }

  // Deleted workspaces are excluded: giving a soft-deleted tenant a fresh
  // trial would resurrect it in every plan-scoped query and in MRR.
  const candidates = await prisma.workspace.findMany({
    where: { deletedAt: null, subscriptions: { none: {} } },
    select: { id: true, slug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const result: BackfillResult = {
    scanned: candidates.length,
    created: 0,
    skipped: 0,
    missingDefaultPlan: false,
  };

  if (candidates.length === 0) {
    log("backfill: no workspaces missing a subscription");
    return result;
  }

  log(`backfill: ${candidates.length} workspace(s) missing a subscription`);

  for (const workspace of candidates) {
    if (dryRun) {
      log(`backfill: [dry-run] would create a subscription for ${workspace.slug}`);
      result.created += 1;
      continue;
    }

    // A trial dated from now rather than from workspace creation: a workspace
    // that existed unsubscribed for months should not be handed an
    // already-expired trial, which would read as past_due the moment it is
    // created.
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    try {
      await prisma.$transaction(async (tx) => {
        // Re-check inside the transaction so two concurrent release jobs
        // cannot both create one.
        const existing = await tx.subscription.findFirst({
          where: { workspaceId: workspace.id },
          select: { id: true },
        });
        if (existing) {
          result.skipped += 1;
          return;
        }

        await tx.subscription.create({
          data: {
            workspaceId: workspace.id,
            planId: defaultPlan.id,
            status: "trialing",
            billingInterval: "monthly",
            trialEndsAt,
            currentPeriodStart: new Date(),
            currentPeriodEnd: trialEndsAt,
          },
        });

        // Mirror the trial onto the workspace, matching what workspace
        // creation does, so the dashboard trial banner is consistent.
        await tx.workspace.update({
          where: { id: workspace.id },
          data: { trialEndsAt },
        });

        result.created += 1;
      });
      log(`backfill: created subscription for ${workspace.slug}`);
    } catch (error) {
      // One bad workspace must not abort the release. Log and continue —
      // a partial backfill is safe to re-run.
      log(
        `backfill: FAILED for ${workspace.slug}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      result.skipped += 1;
    }
  }

  log(`backfill: created ${result.created}, skipped ${result.skipped}`);
  return result;
}
