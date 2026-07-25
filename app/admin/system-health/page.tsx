import type { Metadata } from "next";
import { Activity, Database, Mail, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "System Health · Admin",
};

export default async function AdminSystemHealthPage() {
  const [workspaceCount, queuedMessages, failedMessages, pendingPayments, recentLogs, maintenance] =
    await Promise.all([
      prisma.workspace.count({ where: { deletedAt: null } }),
      prisma.message.count({ where: { status: "queued" } }),
      prisma.message.count({ where: { status: "failed" } }),
      prisma.payment.count({ where: { status: { in: ["requires_payment", "processing"] } } }),
      prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      prisma.maintenanceSetting.findUnique({ where: { id: "platform" } }),
    ]);

  return (
    <>
      <PageHeader
        title="System Health"
        description="Operational readiness for database, queues, payments, logs, and maintenance state."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Database} label="Tenants" value={String(workspaceCount)} hint="Database reachable" />
        <MetricCard icon={Mail} label="Queued messages" value={String(queuedMessages)} hint={`${failedMessages} failed sends`} />
        <MetricCard icon={Activity} label="Pending payments" value={String(pendingPayments)} hint="Requires payment or processing" />
        <MetricCard icon={ShieldCheck} label="Maintenance" value={maintenance?.enabled ? "On" : "Off"} hint="Platform maintenance mode" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Queues">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email queue</span>
              <StatusBadge status={failedMessages > 0 ? "degraded" : "healthy"} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Payment expiration sweep</span>
              <StatusBadge status="manual" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Domain propagation checks</span>
              <StatusBadge status="ready" />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Recent Logs">
          <div className="space-y-3">
            {recentLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
            ) : (
              recentLogs.map((log) => (
                <div key={log.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <p className="text-sm font-medium text-foreground">{log.action.replace(/_/g, " ")}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </>
  );
}
