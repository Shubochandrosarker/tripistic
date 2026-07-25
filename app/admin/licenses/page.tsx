import type { Metadata } from "next";
import { ShieldCheck, Users, UserX } from "lucide-react";
import { prisma } from "@/lib/db";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Licenses · Admin",
};

export default async function AdminLicensesPage() {
  const [activeMembers, suspendedMembers, workspaces] = await Promise.all([
    prisma.workspaceMember.count({ where: { status: "active" } }),
    prisma.workspaceMember.count({ where: { status: "suspended" } }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { members: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Licenses"
        description="Workspace seat usage and plan limits across the platform."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard icon={ShieldCheck} label="Licensed members" value={String(activeMembers)} hint="Active workspace memberships" />
        <MetricCard icon={UserX} label="Suspended seats" value={String(suspendedMembers)} hint="Suspended memberships" />
        <MetricCard icon={Users} label="Organizations" value={String(workspaces.length)} hint="Tenant accounts" />
      </div>

      <TableShell
        headers={["Organization", "Plan", "Members", "Plan Limit", "Status"]}
        isEmpty={workspaces.length === 0}
        emptyMessage="No organizations yet."
      >
        {workspaces.map((workspace) => {
          const subscription = workspace.subscriptions[0];
          const limits = subscription?.plan.limits && typeof subscription.plan.limits === "object" && !Array.isArray(subscription.plan.limits)
            ? (subscription.plan.limits as Record<string, number>)
            : {};
          const memberLimit = limits.team_members ?? limits.members ?? null;
          return (
            <tr key={workspace.id}>
              <Td>
                <span className="font-medium">{workspace.name}</span>
                <span className="block text-xs text-muted-foreground">/{workspace.slug}</span>
              </Td>
              <Td>{subscription?.plan.name ?? "No plan"}</Td>
              <Td className="text-muted-foreground">{workspace._count.members}</Td>
              <Td className="text-muted-foreground">
                {memberLimit === -1 ? "Unlimited" : memberLimit ?? "Not configured"}
              </Td>
              <Td>
                <StatusBadge status={subscription?.status ?? workspace.status} />
              </Td>
            </tr>
          );
        })}
      </TableShell>
    </>
  );
}
