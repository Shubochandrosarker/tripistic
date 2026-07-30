import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { BUSINESS_TYPE_LABELS } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requirePlatformAdminPage } from "@/lib/auth/guards";
import { setWorkspaceStatus } from "@/lib/admin/platform-actions";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Workspaces · Admin",
};

/**
 * Suspend or reactivate a workspace.
 *
 * A server action rather than a client fetch, matching the maintenance page:
 * the guard runs on the server, so the control cannot be driven by anyone who
 * merely reaches the endpoint.
 */
async function toggleWorkspaceStatus(formData: FormData) {
  "use server";

  const admin = await requirePlatformAdminPage();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "suspended") return;

  await setWorkspaceStatus(workspaceId, status, { actorId: admin.id });
  revalidatePath("/admin/workspaces");
}

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
        description="All tour business accounts on the platform. Suspending takes a workspace offline without deleting anything; reactivating restores it exactly as it was."
      />
      <TableShell
        headers={["Workspace", "Owner", "Type", "Plan", "Members", "Status", "Created", ""]}
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
              <Td>
                {/*
                  Archived workspaces are deliberately given no control: that
                  state comes from the owner deleting their account, and
                  reactivating from here would silently undo it.
                */}
                {workspace.status === "archived" ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <form action={toggleWorkspaceStatus}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={workspace.status === "suspended" ? "active" : "suspended"}
                    />
                    <Button type="submit" variant="secondary" className="h-8 px-3 text-xs">
                      {workspace.status === "suspended" ? "Reactivate" : "Suspend"}
                    </Button>
                  </form>
                )}
              </Td>
            </tr>
          );
        })}
      </TableShell>
    </>
  );
}
