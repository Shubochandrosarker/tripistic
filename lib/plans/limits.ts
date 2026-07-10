import { cache } from "react";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { FeatureKeyValue } from "@/lib/constants";

/**
 * Plan limits and feature-flag resolution.
 * Resolution order: workspace override → plan default → disabled.
 */

export const getWorkspaceSubscription = cache(async (workspaceId: string) => {
  return prisma.subscription.findFirst({
    where: { workspaceId, status: { in: ["trialing", "active", "past_due"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
});

export async function isFeatureEnabled(
  workspaceId: string,
  featureKey: FeatureKeyValue,
): Promise<boolean> {
  const override = await prisma.featureFlag.findFirst({
    where: { workspaceId, featureKey },
    orderBy: { updatedAt: "desc" },
  });
  if (override) return override.enabled;

  const subscription = await getWorkspaceSubscription(workspaceId);
  if (!subscription) return false;

  const planDefault = await prisma.featureFlag.findFirst({
    where: { planId: subscription.planId, workspaceId: null, featureKey },
    orderBy: { updatedAt: "desc" },
  });
  return planDefault?.enabled ?? false;
}

/**
 * Read a numeric limit from a plan's limits JSON.
 * Returns null when unset; -1 means unlimited.
 */
export function getPlanLimit(plan: Plan, key: string): number | null {
  const limits = plan.limits;
  if (limits && typeof limits === "object" && !Array.isArray(limits)) {
    const value = (limits as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

export function isUnlimited(limit: number | null): boolean {
  return limit === -1;
}
