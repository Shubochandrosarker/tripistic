import type { Metadata } from "next";
import { Activity, Database, Mail, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { getJobHealth, overallJobState } from "@/lib/jobs/health";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "System Health · Admin",
};

// Health that is cached is not health. This page must reflect the moment it is
// loaded, which is the only moment an operator cares about.
export const dynamic = "force-dynamic";

function relativeAge(date: Date | null): string {
  if (!date) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function AdminSystemHealthPage() {
  const [
    workspaceCount,
    queuedMessages,
    retryingMessages,
    failedMessages,
    pendingPayments,
    recentLogs,
    maintenance,
    jobs,
  ] = await Promise.all([
    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.message.count({ where: { status: "queued" } }),
    prisma.message.count({ where: { status: "pending_retry" } }),
    prisma.message.count({ where: { status: "failed" } }),
    prisma.payment.count({ where: { status: { in: ["requires_payment", "processing"] } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.maintenanceSetting.findUnique({ where: { id: "platform" } }),
    getJobHealth(),
  ]);

  const schedulerState = overallJobState(jobs);

  return (
    <>
      <PageHeader
        title="System Health"
        description="Operational readiness for the scheduler, database, queues, payments, and maintenance state."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Database} label="Tenants" value={String(workspaceCount)} hint="Database reachable" />
        <MetricCard
          icon={Mail}
          label="Email queue"
          value={String(queuedMessages + retryingMessages)}
          hint={`${retryingMessages} retrying · ${failedMessages} need attention`}
        />
        <MetricCard
          icon={Activity}
          label="Pending payments"
          value={String(pendingPayments)}
          hint="Requires payment or processing"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Maintenance"
          value={maintenance?.enabled ? "On" : "Off"}
          hint="Platform maintenance mode"
        />
      </div>

      {/*
        Previously this section rendered `status="manual"` and `status="ready"`
        as literals — they described intent, not reality, and would have kept
        reporting "ready" while the worker was down. Every value below comes
        from the job_runs table.
      */}
      <SectionCard
        title="Scheduled jobs"
        description="Read from job run history. A job whose last run is over an hour old means the worker is not running."
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <span className="text-sm font-medium text-foreground">Scheduler</span>
          <StatusBadge status={schedulerState} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">Job</th>
                <th className="pb-2 font-medium">State</th>
                <th className="pb-2 font-medium">Last run</th>
                <th className="pb-2 font-medium">Outcome</th>
                <th className="pb-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.name} className="border-t border-border align-top">
                  <td className="py-2 pr-4">
                    <p className="font-medium text-foreground">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{job.description}</p>
                    {job.lastError ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{job.lastError}</p>
                    ) : null}
                    {job.consecutiveSkips > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {job.consecutiveSkips} consecutive skipped run(s) — another instance held the lock
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={job.state} />
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{relativeAge(job.lastRunAt)}</td>
                  <td className="py-2 pr-4">
                    {job.lastStatus ? (
                      <StatusBadge status={job.lastStatus} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {job.lastDurationMs == null ? "—" : `${job.lastDurationMs}ms`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Queues">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email awaiting retry</span>
              <StatusBadge status={retryingMessages > 0 ? "pending_retry" : "healthy"} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email needing attention</span>
              <StatusBadge status={failedMessages > 0 ? "degraded" : "healthy"} />
            </div>
          </div>
          {failedMessages > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {failedMessages} message(s) exhausted their retries or were permanently rejected.
            </p>
          ) : null}
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
