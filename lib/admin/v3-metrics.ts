import { prisma } from "@/lib/db";

/**
 * V3 platform metrics for the owner control plane.
 *
 * Every figure here is counted, never estimated, and the window is stated in
 * the field name. That matters more than it sounds: an admin overview is where
 * "active sites" quietly becomes "sites ever created", and a number nobody can
 * define is a number nobody can act on.
 *
 * Deliberately one round of parallel counts rather than a single clever query.
 * The counts are independent, PostgreSQL runs them concurrently, and each one
 * stays readable next to the question it answers.
 */

export type SitePlatformMetrics = {
  totalSites: number;
  publishedSites: number;
  suspendedSites: number;
  deploymentsLast24h: number;
  failedDeploymentsLast24h: number;
  activeDomains: number;
  failedDomains: number;
  pendingDomains: number;
};

export type AiPlatformMetrics = {
  requestsToday: number;
  requestsThisMonth: number;
  failuresToday: number;
  inputTokensThisMonth: number;
  outputTokensThisMonth: number;
  estimatedCostMillicentsThisMonth: number;
  conversationsBySurface: Array<{ surface: string; count: number }>;
  knowledgeDocuments: number;
  knowledgeFailures: number;
};

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function sitePlatformMetrics(): Promise<SitePlatformMetrics> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    totalSites,
    publishedSites,
    suspendedSites,
    deploymentsLast24h,
    failedDeploymentsLast24h,
    activeDomains,
    failedDomains,
    pendingDomains,
  ] = await Promise.all([
    prisma.site.count({ where: { deletedAt: null } }),
    prisma.site.count({ where: { deletedAt: null, status: "published" } }),
    prisma.site.count({ where: { deletedAt: null, status: "suspended" } }),
    prisma.siteDeployment.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.siteDeployment.count({ where: { createdAt: { gte: dayAgo }, status: "failed" } }),
    prisma.customDomain.count({ where: { status: "active" } }),
    prisma.customDomain.count({ where: { status: "failed" } }),
    prisma.customDomain.count({
      where: { status: { in: ["pending_dns", "verifying", "verified", "ssl_pending"] } },
    }),
  ]);

  return {
    totalSites,
    publishedSites,
    suspendedSites,
    deploymentsLast24h,
    failedDeploymentsLast24h,
    activeDomains,
    failedDomains,
    pendingDomains,
  };
}

export async function aiPlatformMetrics(): Promise<AiPlatformMetrics> {
  const today = startOfTodayUtc();
  const month = startOfMonthUtc();

  const [requestsToday, failuresToday, monthly, bySurface, knowledgeDocuments, knowledgeFailures] =
    await Promise.all([
      prisma.aiUsageEvent.count({ where: { createdAt: { gte: today } } }),
      prisma.aiUsageEvent.count({ where: { createdAt: { gte: today }, success: false } }),
      prisma.aiUsageEvent.aggregate({
        where: { createdAt: { gte: month } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
      }),
      prisma.aiConversation.groupBy({ by: ["surface"], _count: { _all: true } }),
      prisma.knowledgeDocument.count(),
      prisma.knowledgeDocument.count({ where: { status: "failed" } }),
    ]);

  return {
    requestsToday,
    failuresToday,
    requestsThisMonth: monthly._count._all,
    inputTokensThisMonth: monthly._sum.inputTokens ?? 0,
    outputTokensThisMonth: monthly._sum.outputTokens ?? 0,
    estimatedCostMillicentsThisMonth: monthly._sum.estimatedCost ?? 0,
    conversationsBySurface: bySurface.map((row) => ({
      surface: row.surface,
      count: row._count._all,
    })),
    knowledgeDocuments,
    knowledgeFailures,
  };
}

/**
 * The most expensive workspaces this month.
 *
 * Cost attribution, not billing. `estimatedCost` is derived from a static price
 * table that provider changes and account discounts both invalidate, so this
 * answers "who should I look at" and must never appear on an invoice — the
 * admin view labels it as an estimate for the same reason.
 */
export async function aiCostByWorkspace(limit = 20) {
  const month = startOfMonthUtc();
  const grouped = await prisma.aiUsageEvent.groupBy({
    by: ["workspaceId"],
    where: { createdAt: { gte: month }, workspaceId: { not: null } },
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true, estimatedCost: true },
    orderBy: { _sum: { estimatedCost: "desc" } },
    take: limit,
  });

  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: grouped.map((row) => row.workspaceId as string) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));

  return grouped.map((row) => ({
    workspaceId: row.workspaceId as string,
    name: byId.get(row.workspaceId as string)?.name ?? "Unknown workspace",
    slug: byId.get(row.workspaceId as string)?.slug ?? "",
    requests: row._count._all,
    inputTokens: row._sum.inputTokens ?? 0,
    outputTokens: row._sum.outputTokens ?? 0,
    estimatedCostMillicents: row._sum.estimatedCost ?? 0,
  }));
}

/** Money is in millicents. One dollar is 100,000 of them. */
export function formatMillicents(value: number): string {
  return `$${(value / 100_000).toFixed(4)}`;
}
