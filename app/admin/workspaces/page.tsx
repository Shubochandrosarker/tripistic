import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { BUSINESS_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Workspaces · Admin",
};

export default async function AdminWorkspacesPage() {
  const workspaces = await prisma.workspace.findMany({
    where: { deletedAt: null },
    take: 100,
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { email: true } },
      subscriptions: {
        where: { status: { in: ["trialing", "active", "past_due"] } },
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { members: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Workspaces"
        description="All tour business accounts on the platform. Management actions arrive in later phases."
      />
      <TableShell
        headers={["Workspace", "Owner", "Type", "Plan", "Members", "Status", "Created"]}
        isEmpty={workspaces.length === 0}
        emptyMessage="No workspaces yet — they appear here as operators sign up."
      >
        {workspaces.map((workspace) => {
          const subscription = workspace.subscriptions[0];
          return (
            <tr key={workspace.id}>
              <Td>
                <span className="font-medium">{workspace.name}</span>
                <span className="block text-xs text-muted-foreground">/{workspace.slug}</span>
              </Td>
              <Td className="text-muted-foreground">{workspace.owner.email}</Td>
              <Td className="text-muted-foreground">
                {BUSINESS_TYPE_LABELS[
                  workspace.businessType as keyof typeof BUSINESS_TYPE_LABELS
                ] ?? workspace.businessType}
              </Td>
              <Td>
                {subscription ? (
                  <span className="inline-flex items-center gap-1.5">
                    {subscription.plan.name}
                    <StatusBadge status={subscription.status} />
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
              <Td className="text-muted-foreground">{workspace._count.members}</Td>
              <Td>
                <StatusBadge status={workspace.status} />
              </Td>
              <Td className="text-muted-foreground">{formatDate(workspace.createdAt)}</Td>
            </tr>
          );
        })}
      </TableShell>
    </>
  );
}
