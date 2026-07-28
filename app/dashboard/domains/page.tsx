import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Globe2, ShieldCheck, Siren } from "lucide-react";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { expectedCnameTarget } from "@/lib/domains/service";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { formatDateTime } from "@/lib/utils";
import { DomainManager } from "@/components/domains/domain-manager";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Domains",
};

export default async function DomainsPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const canManage = canManageWorkspace(active.role);
  const [domains, activeCount, failedCount] = await Promise.all([
    prisma.customDomain.findMany({
      where: { workspaceId: active.workspace.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customDomain.count({ where: { workspaceId: active.workspace.id, status: "active" } }),
    prisma.customDomain.count({ where: { workspaceId: active.workspace.id, status: "failed" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Domains"
        description="Connect a verified hostname to your public storefront."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Globe2} label="Domains" value={String(domains.length)} hint={`CNAME target: ${expectedCnameTarget()}`} />
        <MetricCard icon={ShieldCheck} label="Active" value={String(activeCount)} hint="Serving custom storefront traffic" />
        <MetricCard icon={Siren} label="Needs attention" value={String(failedCount)} hint="Failed health checks" />
      </div>

      <SectionCard
        title="Add and Verify"
        description="Tripistic checks both DNS ownership and routing before a domain can serve traffic."
      >
        <DomainManager
          workspaceId={active.workspace.id}
          canManage={canManage}
          domains={domains.map((domain) => ({
            id: domain.id,
            hostname: domain.hostname,
            status: domain.status,
            verificationToken: domain.verificationToken,
            expectedCname: domain.expectedCname,
            provider: domain.provider,
            providerStatus: domain.providerStatus,
            providerSslStatus: domain.providerSslStatus,
            providerTxtName: domain.providerTxtName,
            providerTxtValue: domain.providerTxtValue,
            providerHttpUrl: domain.providerHttpUrl,
            providerHttpBody: domain.providerHttpBody,
            redirectTo: domain.redirectTo,
            lastCheckMessage: domain.lastCheckMessage,
          }))}
        />
      </SectionCard>

      <SectionCard title="Health History" description="Latest recorded domain state for this workspace.">
        <TableShell
          headers={["Hostname", "Status", "Provider", "Verified", "SSL", "Last Check"]}
          isEmpty={domains.length === 0}
          emptyMessage="No domains configured yet."
        >
          {domains.map((domain) => (
            <tr key={domain.id}>
              <Td className="font-medium">{domain.hostname}</Td>
              <Td>
                <StatusBadge status={domain.status} />
              </Td>
              <Td className="text-muted-foreground">{domain.provider}</Td>
              <Td className="text-muted-foreground">{formatDateTime(domain.verifiedAt)}</Td>
              <Td className="text-muted-foreground">{formatDateTime(domain.sslIssuedAt)}</Td>
              <Td className="text-muted-foreground">{formatDateTime(domain.lastCheckedAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
