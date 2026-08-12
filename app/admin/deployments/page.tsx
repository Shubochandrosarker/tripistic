import type { Metadata } from "next";
import { CheckCircle2, Clock, Rocket, XCircle } from "lucide-react";

import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = { title: "Deployments · Admin" };

/** Wall-clock duration of a finished deployment. */
function duration(startedAt: Date | null, finishedAt: Date | null): string {
  if (!startedAt || !finishedAt) return "—";
  const seconds = Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function AdminDeploymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filterFailed = status === "failed";

  const [deployments, byStatus] = await Promise.all([
    prisma.siteDeployment.findMany({
      where: filterFailed ? { status: "failed" } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        site: { select: { name: true, subdomain: true, workspace: { select: { name: true } } } },
        revision: { select: { versionNumber: true } },
      },
    }),
    prisma.siteDeployment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counted = (value: string) => byStatus.find((row) => row.status === value)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Deployments"
        description="Every publish attempt across the platform. A failed deployment never replaces the live site."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CheckCircle2} label="Live" value={String(counted("live"))} hint="Currently serving" />
        <MetricCard icon={XCircle} label="Failed" value={String(counted("failed"))} hint="All time" />
        <MetricCard
          icon={Clock}
          label="In flight"
          value={String(counted("queued") + counted("building") + counted("deploying"))}
          hint="Queued, building or deploying"
        />
        <MetricCard
          icon={Rocket}
          label="Rolled back"
          value={String(counted("rolled_back"))}
          hint="Superseded by a restore"
        />
      </div>

      <SectionCard
        title={filterFailed ? "Failed deployments" : "Recent deployments"}
        description="Most recent first."
        actions={
          <a
            href={filterFailed ? "/admin/deployments" : "/admin/deployments?status=failed"}
            className="text-sm text-accent hover:underline"
          >
            {filterFailed ? "Show all" : "Show failed only"}
          </a>
        }
      >
        <TableShell
          headers={["Status", "Site", "Organization", "Revision", "Duration", "Error", "When"]}
          isEmpty={deployments.length === 0}
          emptyMessage={filterFailed ? "No failed deployments." : "No deployments yet."}
        >
          {deployments.map((deployment) => (
            <tr key={deployment.id}>
              <Td>
                <StatusBadge status={deployment.status} />
              </Td>
              <Td>
                <span className="text-foreground">{deployment.site.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {deployment.site.subdomain}
                  {deployment.environment === "preview" ? " · preview" : ""}
                </span>
              </Td>
              <Td className="text-muted-foreground">{deployment.site.workspace.name}</Td>
              <Td className="text-muted-foreground">v{deployment.revision.versionNumber}</Td>
              <Td className="text-muted-foreground">
                {duration(deployment.startedAt, deployment.finishedAt)}
              </Td>
              <Td className="max-w-sm text-muted-foreground">{deployment.errorMessage ?? "—"}</Td>
              <Td className="text-muted-foreground">{formatDateTime(deployment.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
