import type { Metadata } from "next";
import { AlertTriangle, Globe2, Layers, Rocket } from "lucide-react";

import { sitePlatformMetrics } from "@/lib/admin/v3-metrics";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { SiteAdminActions } from "@/components/admin/site-admin-actions";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = { title: "Website Platform · Admin" };

export default async function AdminSitesPage() {
  const [metrics, sites, failedDeployments] = await Promise.all([
    sitePlatformMetrics(),
    prisma.site.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        workspace: { select: { name: true, slug: true } },
        _count: { select: { pages: true, revisions: true } },
        domains: { where: { status: "active" }, select: { hostname: true } },
      },
    }),
    prisma.siteDeployment.findMany({
      where: { status: "failed" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { site: { select: { name: true, workspace: { select: { name: true } } } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Website Platform"
        description="Every tenant site, its deployments and its domains. Suspension and rollback are audited and require a reason."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Layers}
          label="Sites"
          value={String(metrics.totalSites)}
          hint={`${metrics.publishedSites} published · ${metrics.suspendedSites} suspended`}
        />
        <MetricCard
          icon={Rocket}
          label="Deployments (24h)"
          value={String(metrics.deploymentsLast24h)}
          hint={`${metrics.failedDeploymentsLast24h} failed`}
        />
        <MetricCard
          icon={Globe2}
          label="Active domains"
          value={String(metrics.activeDomains)}
          hint={`${metrics.pendingDomains} verifying`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Failed domains"
          value={String(metrics.failedDomains)}
          hint="Needs operator or support action"
        />
      </div>

      <SectionCard title="Sites" description="Most recently updated first.">
        <TableShell
          headers={["Site", "Organization", "Status", "Address", "Pages", "Published", "Actions"]}
          isEmpty={sites.length === 0}
          emptyMessage="No tenant sites yet."
        >
          {sites.map((site) => (
            <tr key={site.id}>
              <Td>
                <span className="font-medium text-foreground">{site.name}</span>
                <span className="block text-xs text-muted-foreground">{site.templateKey}</span>
              </Td>
              <Td className="text-muted-foreground">{site.workspace.name}</Td>
              <Td>
                <StatusBadge status={site.status} />
              </Td>
              <Td className="text-muted-foreground">
                {site.domains[0]?.hostname ?? `${site.subdomain}.tripistic.site`}
              </Td>
              <Td className="text-muted-foreground">
                {site._count.pages} · {site._count.revisions} rev
              </Td>
              <Td className="text-muted-foreground">
                {site.publishedAt ? formatDateTime(site.publishedAt) : "Never"}
              </Td>
              <Td>
                <SiteAdminActions
                  siteId={site.id}
                  status={site.status}
                  hasEarlierRevision={site._count.revisions > 1}
                />
              </Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>

      <SectionCard
        title="Failed deployments"
        description="A failed deployment never replaces the live site — the previous revision keeps serving."
      >
        <TableShell
          headers={["Site", "Organization", "Error", "When"]}
          isEmpty={failedDeployments.length === 0}
          emptyMessage="No failed deployments."
        >
          {failedDeployments.map((deployment) => (
            <tr key={deployment.id}>
              <Td className="text-foreground">{deployment.site.name}</Td>
              <Td className="text-muted-foreground">{deployment.site.workspace.name}</Td>
              <Td className="max-w-md text-muted-foreground">{deployment.errorMessage ?? "—"}</Td>
              <Td className="text-muted-foreground">{formatDateTime(deployment.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
