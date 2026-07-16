import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { listCrmTasks } from "@/lib/crm/tasks";
import { serializeCrmTask } from "@/lib/crm/serializers";
import { formatDateTimeInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskCreateForm, ToggleTaskButton } from "@/components/crm/task-form";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewCrm(active.role)) notFound();

  const { tasks, total } = await listCrmTasks(active.workspace.id, {
    page: 1,
    pageSize: 100,
  });
  const manage = canManageCrm(active.role);

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Follow-ups tied to a customer or lead, or general workspace to-dos."
        actions={manage ? <TaskCreateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState icon={ListChecks} title="No tasks yet" description="Add a follow-up task to keep track of what's next." />
      ) : (
        <TableShell headers={["Task", "Linked to", "Due", "Assigned", "Status", ...(manage ? ["Actions"] : [])]}>
          {tasks.map((t) => {
            const item = serializeCrmTask(t);
            return (
              <tr key={item.id} className="transition-colors hover:bg-muted/50">
                <Td className="font-medium">{item.title}</Td>
                <Td className="text-muted-foreground">
                  {item.customer ? (
                    <Link href={`/dashboard/customers/${item.customer.id}`} className="text-accent hover:underline">
                      {item.customer.name}
                    </Link>
                  ) : item.lead ? (
                    <Link href="/dashboard/leads" className="text-accent hover:underline">
                      {item.lead.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="text-muted-foreground">
                  {item.dueAt ? formatDateTimeInTz(new Date(item.dueAt), active.workspace.timezone) : "—"}
                </Td>
                <Td className="text-muted-foreground">{item.assignedTo?.name ?? "Unassigned"}</Td>
                <Td>
                  <StatusBadge status={item.status} />
                </Td>
                {manage ? (
                  <Td>
                    <ToggleTaskButton workspaceId={active.workspace.id} taskId={item.id} status={item.status} />
                  </Td>
                ) : null}
              </tr>
            );
          })}
        </TableShell>
      )}
    </>
  );
}
