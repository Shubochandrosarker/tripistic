import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { backfillMissingSubscriptions } from "@/lib/plans/backfill";
import { DEFAULT_PLAN_SLUG } from "@/lib/constants";
import { canonicalPlans } from "@/lib/plans/catalog";
import { createTestUser, createTestWorkspace, prisma } from "./helpers";

/**
 * Proves the release job's backfill step.
 *
 * The failure it guards against: a workspace created while `plans` was empty
 * gets no subscription, and every entitlement gate then rejects it with 409 —
 * permanently, because nothing in the product repairs it.
 */

/** Mirrors the seed closely enough to exercise the backfill's plan lookup. */
async function ensureDefaultPlan() {
  const canonical = canonicalPlans.find((p) => p.slug === DEFAULT_PLAN_SLUG);
  if (!canonical) throw new Error("default plan missing from the canonical catalog");

  return prisma.plan.upsert({
    where: { slug: DEFAULT_PLAN_SLUG },
    update: {},
    create: {
      slug: canonical.slug,
      name: canonical.name,
      description: canonical.description,
      priceMonthly: canonical.monthlyPriceCents ?? 0,
      priceYearly: canonical.yearlyPriceCents ?? 0,
      currency: "USD",
      features: [...canonical.features],
      limits: canonical.limits,
    },
  });
}

async function workspaceWithoutSubscription() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  // Guard the premise: these fixtures never create a subscription.
  const count = await prisma.subscription.count({ where: { workspaceId: workspace.id } });
  expect(count).toBe(0);
  return workspace;
}

describe("subscription backfill", () => {
  it("creates a trialing subscription for a workspace that has none", async () => {
    await ensureDefaultPlan();
    const workspace = await workspaceWithoutSubscription();

    const result = await backfillMissingSubscriptions(prisma);
    expect(result.missingDefaultPlan).toBe(false);
    expect(result.created).toBeGreaterThan(0);

    const subscription = await prisma.subscription.findFirstOrThrow({
      where: { workspaceId: workspace.id },
      include: { plan: true },
    });
    expect(subscription.status).toBe("trialing");
    expect(subscription.plan.slug).toBe(DEFAULT_PLAN_SLUG);
    expect(subscription.billingInterval).toBe("monthly");
    // Dated from now, not from workspace creation — a long-dormant workspace
    // must not be handed an already-expired trial.
    expect(subscription.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("mirrors the trial onto the workspace so the dashboard banner agrees", async () => {
    await ensureDefaultPlan();
    const workspace = await workspaceWithoutSubscription();

    await backfillMissingSubscriptions(prisma);

    const updated = await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } });
    expect(updated.trialEndsAt).not.toBeNull();
  });

  it("is idempotent — a second run creates nothing new", async () => {
    await ensureDefaultPlan();
    const workspace = await workspaceWithoutSubscription();

    await backfillMissingSubscriptions(prisma);
    const afterFirst = await prisma.subscription.findMany({ where: { workspaceId: workspace.id } });
    expect(afterFirst).toHaveLength(1);

    const second = await backfillMissingSubscriptions(prisma);
    const afterSecond = await prisma.subscription.findMany({ where: { workspaceId: workspace.id } });

    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(afterFirst[0].id);
    // The workspace is no longer a candidate at all on the second pass.
    expect(second.created).toBe(0);
  });

  it("does not touch a workspace that already has a subscription", async () => {
    const plan = await ensureDefaultPlan();
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const existing = await prisma.subscription.create({
      data: {
        workspaceId: workspace.id,
        planId: plan.id,
        status: "active",
        billingInterval: "yearly",
      },
    });

    await backfillMissingSubscriptions(prisma);

    const rows = await prisma.subscription.findMany({ where: { workspaceId: workspace.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existing.id);
    // An active paying subscription must never be downgraded to a trial.
    expect(rows[0].status).toBe("active");
    expect(rows[0].billingInterval).toBe("yearly");
  });

  it("skips soft-deleted workspaces", async () => {
    await ensureDefaultPlan();
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { deletedAt: new Date() },
    });

    await backfillMissingSubscriptions(prisma);

    // Resurrecting a deleted tenant would put it back into plan-scoped
    // queries and into MRR.
    const rows = await prisma.subscription.findMany({ where: { workspaceId: workspace.id } });
    expect(rows).toHaveLength(0);
  });

  it("writes nothing in dry-run mode but still reports the count", async () => {
    await ensureDefaultPlan();
    const workspace = await workspaceWithoutSubscription();

    const result = await backfillMissingSubscriptions(prisma, { dryRun: true });
    expect(result.created).toBeGreaterThan(0);

    const rows = await prisma.subscription.findMany({ where: { workspaceId: workspace.id } });
    expect(rows).toHaveLength(0);
  });

  it("reports the missing plan rather than creating a broken subscription", async () => {
    // Simulates running the backfill before the seed. It must refuse, not
    // guess at a plan — the release job turns this into a failed deploy.
    const slug = `orphan-${randomUUID().slice(0, 8)}`;
    await prisma.plan.updateMany({ where: { slug: DEFAULT_PLAN_SLUG }, data: { slug } });
    try {
      const result = await backfillMissingSubscriptions(prisma);
      expect(result.missingDefaultPlan).toBe(true);
      expect(result.created).toBe(0);
    } finally {
      await prisma.plan.updateMany({ where: { slug }, data: { slug: DEFAULT_PLAN_SLUG } });
    }
  });
});
