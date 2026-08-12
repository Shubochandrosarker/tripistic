import { redirect } from "next/navigation";
import { AlertTriangle, FileText, Globe2, Rocket } from "lucide-react";

import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSite } from "@/lib/sites/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { formatDate } from "@/lib/utils";
import { PublishPanel } from "@/components/sites/publish-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export default async function SiteOverviewPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const workspaceId = active.workspace.id;
  const { siteId } = await params;
  const site = await getSite(workspaceId, siteId);
  const canManage = canManageWorkspace(active.role);

  const [revisions, deployments, domains] = await Promise.all([
    prisma.siteRevision.findMany({
      where: { siteId, workspaceId },
      orderBy: { versionNumber: "desc" },
      take: 20,
      select: { id: true, versionNumber: true, note: true, createdAt: true },
    }),
    prisma.siteDeployment.findMany({
      where: { siteId, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.customDomain.findMany({
      where: { siteId, workspaceId },
      select: { hostname: true, status: true },
    }),
  ]);

  const failedRecently = deployments.filter((deployment) => deployment.status === "failed").length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Globe2}
          label="Address"
          value={domains[0]?.hostname ?? `${site.subdomain}.tripistic.site`}
          hint={domains[0] ? `Custom domain · ${domains[0].status}` : "Tripistic subdomain"}
        />
        <MetricCard icon={FileText} label="Pages" value={String(site.pages.length)} hint="Including template pages" />
        <MetricCard
          icon={Rocket}
          label="Published"
          value={site.publishedAt ? formatDate(site.publishedAt) : "Never"}
          hint={`${revisions.length} revision${revisions.length === 1 ? "" : "s"}`}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Failed deployments"
          value={String(failedRecently)}
          hint="In the last ten attempts"
        />
      </div>

      <SectionCard
        title="Publishing"
        description="Publishing snapshots the current draft and puts it on the edge. The previous revision stays available to roll back to."
      >
        <PublishPanel
          workspaceId={workspaceId}
          siteId={site.id}
          canManage={canManage}
          revisions={revisions.map((revision) => ({
            ...revision,
            createdAt: revision.createdAt.toISOString(),
          }))}
          deployments={deployments.map((deployment) => ({
            id: deployment.id,
            status: deployment.status,
            liveUrl: deployment.liveUrl,
            previewUrl: deployment.previewUrl,
            errorMessage: deployment.errorMessage,
            createdAt: deployment.createdAt.toISOString(),
          }))}
        />
      </SectionCard>

      <SectionCard title="Recent deployments">
        <TableShell
          headers={["Status", "Environment", "URL", "Message", "When"]}
          isEmpty={deployments.length === 0}
          emptyMessage="This website has not been deployed yet."
        >
          {deployments.map((deployment) => (
            <tr key={deployment.id}>
              <Td>
                <StatusBadge status={deployment.status} />
              </Td>
              <Td className="text-muted-foreground">{deployment.environment}</Td>
              <Td className="max-w-xs truncate text-muted-foreground">
                {deployment.liveUrl ?? deployment.previewUrl ?? "—"}
              </Td>
              <Td className="max-w-sm text-muted-foreground">{deployment.errorMessage ?? "—"}</Td>
              <Td className="text-muted-foreground">{formatDate(deployment.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
