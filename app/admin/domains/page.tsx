import type { Metadata } from "next";
import { Globe2, ShieldCheck, Siren } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Domains · Admin",
};

export default async function AdminDomainsPage() {
  const [domains, activeCount, failedCount] = await Promise.all([
    prisma.customDomain.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { workspace: { select: { name: true, slug: true } } },
    }),
    prisma.customDomain.count({ where: { status: "active" } }),
    prisma.customDomain.count({ where: { status: "failed" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Custom Domains"
        description="DNS verification, SSL readiness, propagation checks, and domain health monitoring."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={Globe2} label="Domains" value={String(domains.length)} hint="Total configured hostnames" />
        <MetricCard icon={ShieldCheck} label="Active SSL" value={String(activeCount)} hint="Verified and serving" />
        <MetricCard icon={Siren} label="Needs attention" value={String(failedCount)} hint="Failed checks" />
      </div>

      <SectionCard title="Verification Contract">
        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
          <p>DNS: create the expected CNAME and TXT token per domain row.</p>
          <p>SSL: issue certificates only after status reaches verified.</p>
          <p>Health: record propagation and TLS checks in lastCheckMessage.</p>
        </div>
      </SectionCard>

      <TableShell
        headers={["Domain", "Organization", "Status", "Expected CNAME", "Last Check", "Message"]}
        isEmpty={domains.length === 0}
        emptyMessage="No custom domains configured yet."
      >
        {domains.map((domain) => (
          <tr key={domain.id}>
            <Td className="font-medium">{domain.hostname}</Td>
            <Td>
              <span>{domain.workspace.name}</span>
              <span className="block text-xs text-muted-foreground">/{domain.workspace.slug}</span>
            </Td>
            <Td>
              <StatusBadge status={domain.status} />
            </Td>
            <Td className="font-mono text-xs text-muted-foreground">{domain.expectedCname}</Td>
            <Td className="text-muted-foreground">{formatDateTime(domain.lastCheckedAt)}</Td>
            <Td className="max-w-sm text-muted-foreground">{domain.lastCheckMessage ?? "Awaiting first check"}</Td>
          </tr>
        ))}
      </TableShell>
    </>
  );
}
