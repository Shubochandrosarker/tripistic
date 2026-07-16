import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { crmTaskListQuerySchema, crmTaskSchema } from "@/lib/validation";
import { createCrmTask, listCrmTasks } from "@/lib/crm/tasks";
import { serializeCrmTask } from "@/lib/crm/serializers";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewCrm(membership.role)) {
      throw forbidden("You do not have permission to view tasks.");
    }

    const url = new URL(request.url);
    const query = crmTaskListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      assignedToId: url.searchParams.get("assignedToId") || undefined,
      customerId: url.searchParams.get("customerId") || undefined,
      leadId: url.searchParams.get("leadId") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { tasks, total } = await listCrmTasks(id, query);
    return json({ tasks: tasks.map(serializeCrmTask), total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage tasks.");
    }

    const body = await request.json().catch(() => null);
    const data = crmTaskSchema.parse(body);
    const task = await createCrmTask(id, { ...data, createdById: user.id });

    await recordAuditEvent({
      action: "crm_task_created",
      workspaceId: id,
      userId: user.id,
      entityType: "crm_task",
      entityId: task.id,
      metadata: { title: task.title },
      request,
    });

    return json({ task: serializeCrmTask(task) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
