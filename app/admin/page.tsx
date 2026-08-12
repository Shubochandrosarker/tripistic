import type { Metadata } from "next";
import { Building2, CreditCard, Globe2, Layers, Rocket, ScrollText, Sparkles, Users } from "lucide-react";
import { aiPlatformMetrics, formatMillicents, sitePlatformMetrics } from "@/lib/admin/v3-metrics";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { TableShell, Td } from "@/components/ui/table-shell";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Platform admin",
};

export default async function AdminOverviewPage() {
  const [
    workspaceCount,
    userCount,
    activeSubscriptions,
    trialingSubscriptions,
    recentLogs,
    siteMetrics,
    aiMetrics,
  ] = await Promise.all([
      prisma.workspace.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.subscription.count({ where: { status: "active" } }),
      prisma.subscription.count({ where: { status: "trialing" } }),
      prisma.auditLog.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        workspace: { select: { name: true } },
      },
    }),
    sitePlatformMetrics(),
    aiPlatformMetrics(),
  ]);

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Live platform-level counts and recent activity across all workspaces."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Building2}
          label="Workspaces"
          value={String(workspaceCount)}
          hint="Total active tour businesses"
        />
        <MetricCard
          icon={Users}
          label="Users"
          value={String(userCount)}
          hint="Registered accounts"
        />
        <MetricCard
          icon={CreditCard}
          label="Active subscriptions"
          value={String(activeSubscriptions)}
          hint="Workspaces on a paid, non-trial subscription"
        />
        <MetricCard
          icon={ScrollText}
          label="Trialing"
          value={String(trialingSubscriptions)}
          hint="Workspaces in free trial"
        />
      </div>

      <SectionCard
        title="V3 platform"
        description="Website platform and AI, at a glance. Every figure is counted over the window named beside it."
        actions={
          <div className="flex gap-2">
            <ButtonLink href="/admin/sites" variant="secondary" size="sm">
              Sites
            </ButtonLink>
            <ButtonLink href="/admin/ai" variant="secondary" size="sm">
              AI
            </ButtonLink>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Layers}
            label="Tenant sites"
            value={String(siteMetrics.totalSites)}
            hint={`${siteMetrics.publishedSites} published · ${siteMetrics.suspendedSites} suspended`}
          />
          <MetricCard
            icon={Rocket}
            label="Deployments (24h)"
            value={String(siteMetrics.deploymentsLast24h)}
            hint={`${siteMetrics.failedDeploymentsLast24h} failed`}
          />
          <MetricCard
            icon={Globe2}
            label="Active domains"
            value={String(siteMetrics.activeDomains)}
            hint={`${siteMetrics.failedDomains} failed · ${siteMetrics.pendingDomains} verifying`}
          />
          <MetricCard
            icon={Sparkles}
            label="AI requests today"
            value={String(aiMetrics.requestsToday)}
            hint={`${aiMetrics.failuresToday} failed · ${formatMillicents(aiMetrics.estimatedCostMillicentsThisMonth)} est. this month`}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Recent audit activity"
        actions={
          <ButtonLink href="/admin/audit-logs" variant="secondary" size="sm">
            View all
          </ButtonLink>
        }
      >
        <TableShell
          headers={["Action", "User", "Workspace", "When"]}
          isEmpty={recentLogs.length === 0}
          emptyMessage="No audit events recorded yet."
          className="border-0 shadow-none"
        >
          {recentLogs.map((log) => (
            <tr key={log.id}>
              <Td className="font-medium">{log.action.replace(/_/g, " ")}</Td>
              <Td className="text-muted-foreground">{log.user?.email ?? "system"}</Td>
              <Td className="text-muted-foreground">{log.workspace?.name ?? "—"}</Td>
              <Td className="text-muted-foreground">{formatDateTime(log.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
