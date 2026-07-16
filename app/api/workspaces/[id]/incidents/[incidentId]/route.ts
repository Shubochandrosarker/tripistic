import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageOperations } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateIncidentSchema } from "@/lib/validation";
import { updateIncident } from "@/lib/dispatch/service";

type Params = { params: Promise<{ id: string; incidentId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, incidentId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageOperations(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can update incidents.");
    }

    const body = await request.json().catch(() => null);
    const data = updateIncidentSchema.parse(body);
    const incident = await updateIncident(id, incidentId, data);

    await recordAuditEvent({
      action: "incident_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "incident_report",
      entityId: incident.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ incident });
  } catch (error) {
    return handleApiError(error);
  }
}
