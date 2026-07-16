import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageOperations, canViewOperations } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createIncidentSchema, incidentListQuerySchema } from "@/lib/validation";
import { createIncident, listIncidents } from "@/lib/dispatch/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewOperations(membership.role)) {
      throw forbidden("You do not have permission to view incidents.");
    }

    const url = new URL(request.url);
    const query = incidentListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      severity: url.searchParams.get("severity") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { incidents, total } = await listIncidents(id, query);
    return json({ incidents, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageOperations(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can report incidents.");
    }

    const body = await request.json().catch(() => null);
    const data = createIncidentSchema.parse(body);
    const incident = await createIncident(id, { ...data, reportedById: user.id });

    await recordAuditEvent({
      action: "incident_created",
      workspaceId: id,
      userId: user.id,
      entityType: "incident_report",
      entityId: incident.id,
      metadata: { severity: incident.severity, category: incident.category },
      request,
    });

    return json({ incident }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
