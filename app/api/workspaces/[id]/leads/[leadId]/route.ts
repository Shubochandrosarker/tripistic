import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateLeadSchema } from "@/lib/validation";
import { getLead, updateLead } from "@/lib/crm/leads";
import { serializeLead } from "@/lib/crm/serializers";

type Params = { params: Promise<{ id: string; leadId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, leadId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canViewCrm(membership.role)) {
      throw forbidden("You do not have permission to view leads.");
    }
    const lead = await getLead(id, leadId);
    return json({
      lead: {
        ...serializeLead(lead),
        tasks: lead.tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt?.toISOString() ?? null })),
        activities: lead.activities.map((a) => ({
          id: a.id,
          type: a.type,
          subject: a.subject,
          body: a.body,
          occurredAt: a.occurredAt.toISOString(),
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, leadId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage leads.");
    }

    const body = await request.json().catch(() => null);
    const data = updateLeadSchema.parse(body);
    const lead = await updateLead(id, leadId, data);

    await recordAuditEvent({
      action: "lead_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "lead",
      entityId: lead.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ lead: serializeLead(lead) });
  } catch (error) {
    return handleApiError(error);
  }
}
