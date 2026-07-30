import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { crmActivitySchema } from "@/lib/validation";
import { createActivity } from "@/lib/crm/activities";

type Params = { params: Promise<{ id: string }> };

/** Logs a manual touchpoint (call, email, WhatsApp, SMS, meeting, or note) on a customer or lead's timeline. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can log activity.");
    }

    const body = await request.json().catch(() => null);
    const data = crmActivitySchema.parse(body);
    const activity = await createActivity(id, { ...data, createdById: user.id });

    await recordAuditEvent({
      action: "crm_activity_logged",
      workspaceId: id,
      userId: user.id,
      entityType: "crm_activity",
      entityId: activity.id,
      metadata: { type: activity.type, customerId: activity.customerId ?? "", leadId: activity.leadId ?? "" },
      request,
    });

    return json(
      {
        activity: {
          id: activity.id,
          type: activity.type,
          subject: activity.subject,
          body: activity.body,
          occurredAt: activity.occurredAt.toISOString(),
        },
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
