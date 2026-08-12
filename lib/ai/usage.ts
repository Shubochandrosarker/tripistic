import type { AiSurface } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { getPlanLimit, getWorkspaceSubscription, isUnlimited } from "@/lib/plans/limits";

import type { AiTask } from "@/lib/ai/tasks";

/**
 * AI usage metering and plan enforcement.
 *
 * `ai_credits_monthly` has existed in every plan since the public-launch
 * catalogue and has, until now, decremented nothing. Turning it on is a
 * behaviour change for live workspaces, so it is introduced the careful way:
 *
 *   - the budget is checked **before** the call, not after, because a limit
 *     enforced retroactively is a bill, not a limit;
 *   - a workspace crossing 80% gets a warning in the response rather than a
 *     surprise at 100%;
 *   - a platform admin can grant an override, so hitting the ceiling mid-season
 *     is a support conversation and not an outage;
 *   - and unlimited (-1) is honoured, so Enterprise is unaffected.
 *
 * Cost is tracked in **millicents** as an integer. A single call can cost
 * $0.0003; accumulating that in a float over a month of traffic produces a
 * number that is visibly wrong next to the provider's invoice.
 */

export type UsageWindow = { start: Date; end: Date };

/** Calendar month in UTC. Matches how the plan describes the allowance. */
export function currentUsageWindow(now: Date = new Date()): UsageWindow {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export type UsageSnapshot = {
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  warning: boolean;
  window: UsageWindow;
};

const OVERRIDE_FEATURE_KEY = "ai_usage_override";
const WARN_AT = 0.8;

async function creditLimit(workspaceId: string): Promise<number | null> {
  const subscription = await getWorkspaceSubscription(workspaceId);
  if (!subscription) return 0;

  const entitlement = await prisma.entitlement.findUnique({
    where: { planId_key: { planId: subscription.planId, key: "ai_credits_monthly" } },
    select: { enabled: true, limitValue: true },
  });
  if (entitlement?.enabled && entitlement.limitValue !== null) return entitlement.limitValue;

  return getPlanLimit(subscription.plan, "ai_credits_monthly");
}

/**
 * Whether an admin has lifted this workspace's ceiling.
 *
 * Reuses the existing per-workspace `FeatureFlag` override rather than adding
 * a column, so an override is already audited, already visible in the admin
 * feature-flag surface, and already removable there.
 */
async function hasUsageOverride(workspaceId: string): Promise<boolean> {
  const override = await prisma.featureFlag.findFirst({
    // An expired credit-ceiling lift must stop lifting the ceiling; otherwise
    // "temporary extra credits for the season" is an unmetered account.
    where: {
      workspaceId,
      featureKey: OVERRIDE_FEATURE_KEY,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { updatedAt: "desc" },
    select: { enabled: true },
  });
  return override?.enabled === true;
}

export async function creditsUsed(
  workspaceId: string,
  window: UsageWindow = currentUsageWindow(),
): Promise<number> {
  const meter = await prisma.usageMeter.findFirst({
    where: { workspaceId, key: "ai_credits", periodStart: window.start },
    select: { used: true },
  });
  return meter?.used ?? 0;
}

export async function usageSnapshot(workspaceId: string): Promise<UsageSnapshot> {
  const window = currentUsageWindow();
  const [used, limit] = await Promise.all([creditsUsed(workspaceId, window), creditLimit(workspaceId)]);

  if (limit === null || isUnlimited(limit)) {
    return { used, limit: null, remaining: null, percentUsed: null, warning: false, window };
  }

  const percentUsed = limit > 0 ? Math.round((used / limit) * 100) : 100;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percentUsed,
    warning: limit > 0 && used / limit >= WARN_AT,
    window,
  };
}

/**
 * Refuses a call the workspace cannot afford.
 *
 * 402 rather than 429: this is not "slow down", it is "your plan does not
 * include any more of this", and the client should offer an upgrade. The same
 * status `assertFeature` uses, so the client has one branch for both.
 */
export async function assertCredits(workspaceId: string, cost: number): Promise<UsageSnapshot> {
  const snapshot = await usageSnapshot(workspaceId);
  if (snapshot.limit === null) return snapshot;
  if (snapshot.used + cost <= snapshot.limit) return snapshot;

  if (await hasUsageOverride(workspaceId)) {
    logger.warn("ai.usage_override_applied", { workspaceId, used: snapshot.used });
    return snapshot;
  }

  throw new ApiError(
    402,
    `This workspace has used its ${snapshot.limit} monthly AI credits. Upgrade or wait for the next billing period.`,
  );
}

/**
 * Increments the meter atomically.
 *
 * An upsert with an increment, not read-then-write: two concurrent AI calls
 * from the same workspace must not both read 99 and both write 100.
 */
export async function consumeCredits(workspaceId: string, cost: number): Promise<void> {
  if (cost <= 0) return;
  const window = currentUsageWindow();
  await prisma.usageMeter.upsert({
    where: {
      workspaceId_key_periodStart_periodEnd: {
        workspaceId,
        key: "ai_credits",
        periodStart: window.start,
        periodEnd: window.end,
      },
    },
    create: {
      workspaceId,
      key: "ai_credits",
      used: cost,
      periodStart: window.start,
      periodEnd: window.end,
    },
    update: { used: { increment: cost } },
  });
}

export type UsageEventInput = {
  workspaceId: string | null;
  userId: string | null;
  surface: AiSurface;
  task: AiTask;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMillicents: number;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  requestId?: string;
};

/**
 * Records one model call.
 *
 * Failures are recorded too. A month where 40% of calls errored is the single
 * most useful thing to know about an AI feature, and a table that only holds
 * successes cannot tell you.
 *
 * Never throws. Losing an analytics row must not fail the user's request that
 * otherwise succeeded.
 */
export async function recordUsageEvent(input: UsageEventInput): Promise<void> {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        surface: input.surface,
        task: input.task,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estimatedCost: input.estimatedCostMillicents,
        latencyMs: input.latencyMs,
        success: input.success,
        errorType: input.errorType ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (error) {
    logger.error("ai.usage_event_failed", { surface: input.surface, task: input.task }, error);
  }
}

/**
 * Per-million-token prices in millicents, used for cost attribution only.
 *
 * Explicitly an estimate, and labelled as one everywhere it surfaces. Provider
 * pricing changes without notice and per-account discounts exist, so this is
 * for "which workspace is expensive" and never for anything a customer is
 * billed from.
 */
const MODEL_PRICES_MILLICENTS_PER_MTOK: Record<string, { input: number; output: number }> = {
  "openai/gpt-4o": { input: 250_000, output: 1_000_000 },
  "openai/gpt-4o-mini": { input: 15_000, output: 60_000 },
  "openai/text-embedding-3-small": { input: 2_000, output: 0 },
  "workers-ai/@cf/meta/llama-3.1-8b-instruct": { input: 2_800, output: 2_800 },
  "workers-ai/@cf/baai/bge-base-en-v1.5": { input: 2_000, output: 0 },
};

export function estimateCostMillicents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = MODEL_PRICES_MILLICENTS_PER_MTOK[modelId];
  if (!price) return 0;
  return Math.round(
    (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output,
  );
}

export async function workspaceUsageSummary(workspaceId: string, since: Date) {
  const grouped = await prisma.aiUsageEvent.groupBy({
    by: ["task", "model", "success"],
    where: { workspaceId, createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    _count: { _all: true },
  });
  return grouped.map((row) => ({
    task: row.task,
    model: row.model,
    success: row.success,
    calls: row._count._all,
    inputTokens: row._sum.inputTokens ?? 0,
    outputTokens: row._sum.outputTokens ?? 0,
    estimatedCostMillicents: row._sum.estimatedCost ?? 0,
  }));
}
