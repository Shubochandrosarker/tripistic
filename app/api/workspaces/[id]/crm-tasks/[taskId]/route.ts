import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateCrmTaskSchema } from "@/lib/validation";
import { updateCrmTask } from "@/lib/crm/tasks";
import { serializeCrmTask } from "@/lib/crm/serializers";

type Params = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, taskId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage tasks.");
    }

    const body = await request.json().catch(() => null);
    const data = updateCrmTaskSchema.parse(body);
    const task = await updateCrmTask(id, taskId, data);

    await recordAuditEvent({
      action: "crm_task_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "crm_task",
      entityId: task.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ task: serializeCrmTask(task) });
  } catch (error) {
    return handleApiError(error);
  }
}
