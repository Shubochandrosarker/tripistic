import { ApiError, conflict } from "@/lib/api";
import { prisma } from "@/lib/db";
import { findCanonicalPlan, type PlanFeatureKey } from "@/lib/plans/catalog";
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

/**
 * ---------------------------------------------------------------------------
 * Phase 8 — server-side feature entitlement
 * ---------------------------------------------------------------------------
 *
 * The gap this closes. The plan catalog defines 22 feature flags and four
 * tiers that differ almost entirely by which of them are on. Until now nothing
 * checked them on the server: the flags drove pricing copy and which nav links
 * rendered, and that was all. A Solo customer who opened devtools, or simply
 * typed the URL, had working access to CRM, operations dispatch, vehicles,
 * suppliers, itineraries, guide scheduling, advanced AI and audit logs — every
 * paid tier's differentiator, on the cheapest plan. Hiding a nav link is not
 * an entitlement; the server has to refuse.
 */

/**
 * Resolution order: workspace override -> plan row in the database -> the
 * canonical catalog -> denied.
 *
 * The catalog fallback is the important one and is deliberate. `FeatureFlag`
 * rows are written by the seed, and a deployment whose seed had not run, or
 * had run against an older catalog, would otherwise resolve every unseeded
 * flag to `false` — turning a partial seed into a total feature outage for
 * paying customers. Falling back to the code that defines the plans means a
 * missing row degrades to the correct answer rather than to "off".
 *
 * A workspace override still wins over both, which is what makes per-tenant
 * grants and emergency kill switches possible.
 */
export async function hasFeature(workspaceId: string, featureKey: PlanFeatureKey): Promise<boolean> {
  const override = await prisma.featureFlag.findFirst({
    where: { workspaceId, featureKey },
    orderBy: { updatedAt: "desc" },
    select: { enabled: true },
  });
  if (override) return override.enabled;

  const subscription = await getWorkspaceSubscription(workspaceId);
  // No entitled subscription at all — trialing, active and past_due all count
  // as entitled (see getWorkspaceSubscription); anything else does not.
  if (!subscription) return false;

  const planRow = await prisma.featureFlag.findFirst({
    where: { planId: subscription.planId, workspaceId: null, featureKey },
    orderBy: { updatedAt: "desc" },
    select: { enabled: true },
  });
  if (planRow) return planRow.enabled;

  const catalogPlan = findCanonicalPlan(subscription.plan.slug);
  return catalogPlan?.flags[featureKey] ?? false;
}

/**
 * Names each gated feature the way a customer would recognise it, so the
 * refusal explains what to buy rather than leaking an internal flag key.
 */
const FEATURE_LABELS: Partial<Record<PlanFeatureKey, string>> = {
  crm_pipeline: "The CRM pipeline",
  itinerary_builder: "The itinerary builder",
  operations_dispatch: "Operations dispatch",
  vehicles: "Fleet management",
  suppliers: "Supplier and vendor management",
  guide_scheduling: "Guide scheduling",
  white_label: "White-label branding",
  custom_domain: "Custom domains",
  storefront_builder: "The storefront builder",
  advanced_ai: "Advanced insights",
  api_access: "API access",
  audit_logs: "Audit logs",
  digital_waivers: "Digital waivers",
  csv_export: "CSV export",
  sso_saml: "SSO / SAML",
  site_ai_generation: "AI website generation",
  ai_copilot: "The Tripistic AI Copilot",
  ai_private_knowledge: "Private workspace knowledge for AI",
};

export function featureLabel(featureKey: PlanFeatureKey): string {
  return FEATURE_LABELS[featureKey] ?? featureKey.replace(/_/g, " ");
}

/**
 * Throws unless the workspace's plan includes the feature.
 *
 * 402 rather than 403: this is not "you may not", it is "your plan does not
 * include this" — a distinction that matters to the client, which should
 * offer an upgrade rather than an error. 403 is reserved for the role checks
 * that already sit alongside these calls, where a different plan would not
 * help.
 */
export async function assertFeature(
  workspaceId: string,
  featureKey: PlanFeatureKey,
): Promise<void> {
  if (await hasFeature(workspaceId, featureKey)) return;
  throw new ApiError(
    402,
    `${featureLabel(featureKey)} is not included in your current plan. Upgrade to enable it.`,
  );
}
