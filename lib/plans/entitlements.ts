import { conflict } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getPlanLimit, getWorkspaceSubscription, isUnlimited } from "@/lib/plans/limits";

export type LimitEvaluation = {
  allowed: boolean;
  limit: number | null;
  current: number;
  next: number;
  percentUsed: number | null;
};

export function evaluateLimit(current: number, increment: number, limit: number | null): LimitEvaluation {
  const next = current + increment;
  const allowed = isUnlimited(limit) || limit === null || next <= limit;
  return {
    allowed,
    limit,
    current,
    next,
    percentUsed: limit && limit > 0 ? Math.round((next / limit) * 100) : null,
  };
}

async function readLimit(subscription: NonNullable<Awaited<ReturnType<typeof getWorkspaceSubscription>>>, key: string) {
  const entitlement = await prisma.entitlement.findUnique({
    where: { planId_key: { planId: subscription.planId, key } },
    select: { enabled: true, limitValue: true },
  });
  if (entitlement?.enabled) return entitlement.limitValue;

  const direct = getPlanLimit(subscription.plan, key);
  if (direct !== null) return direct;

  // Backward compatibility for databases seeded before the public-launch catalog.
  if (key === "active_tours") return getPlanLimit(subscription.plan, "tour_products");
  return null;
}

async function requireSubscription(workspaceId: string) {
  const subscription = await getWorkspaceSubscription(workspaceId);
  if (!subscription) {
    throw conflict("This workspace has no active subscription. Choose a plan before adding more resources.");
  }
  return subscription;
}

export async function getActiveTourUsage(workspaceId: string) {
  return prisma.tour.count({ where: { workspaceId, deletedAt: null, status: "active" } });
}

export async function assertCanActivateTour(workspaceId: string, increment = 1): Promise<LimitEvaluation> {
  const subscription = await requireSubscription(workspaceId);
  const current = await getActiveTourUsage(workspaceId);
  const evaluation = evaluateLimit(current, increment, await readLimit(subscription, "active_tours"));
  if (!evaluation.allowed) {
    throw conflict(
      `This plan allows ${evaluation.limit} active tours. Archive another active tour or upgrade before activating this one.`,
    );
  }
  return evaluation;
}

export async function getSeatUsage(workspaceId: string) {
  const [activeMembers, pendingInvitations] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId, status: "active" } }),
    prisma.invitation.count({
      where: { workspaceId, status: "pending", expiresAt: { gt: new Date() } },
    }),
  ]);
  return { activeMembers, pendingInvitations, totalReservedSeats: activeMembers + pendingInvitations };
}

export async function assertCanReserveSeat(workspaceId: string, increment = 1): Promise<LimitEvaluation> {
  const subscription = await requireSubscription(workspaceId);
  const usage = await getSeatUsage(workspaceId);
  const evaluation = evaluateLimit(usage.totalReservedSeats, increment, await readLimit(subscription, "users"));
  if (!evaluation.allowed) {
    throw conflict(
      `This plan allows ${evaluation.limit} user seats. Revoke a pending invitation, remove a member, or upgrade before inviting another user.`,
    );
  }
  return evaluation;
}

export async function getCustomDomainUsage(workspaceId: string) {
  return prisma.customDomain.count({
    where: { workspaceId, status: { notIn: ["disabled"] } },
  });
}

export async function assertCanAddCustomDomain(workspaceId: string, increment = 1): Promise<LimitEvaluation> {
  const subscription = await requireSubscription(workspaceId);
  const current = await getCustomDomainUsage(workspaceId);
  const evaluation = evaluateLimit(current, increment, await readLimit(subscription, "custom_domains"));
  if (!evaluation.allowed) {
    throw conflict(
      `This plan allows ${evaluation.limit} custom domain. Remove a domain or upgrade before adding another one.`,
    );
  }
  return evaluation;
}
