import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkforce } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateTimeOffSchema } from "@/lib/validation";
import { updateTimeOffStatus } from "@/lib/workforce/service";

type Params = { params: Promise<{ id: string; memberId: string; timeOffId: string }> };

/** Approve or decline a time-off request. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, timeOffId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "guide_scheduling" });
    if (!canManageWorkforce(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage time off.");
    }

    const body = await request.json().catch(() => null);
    const data = updateTimeOffSchema.parse(body);
    const timeOff = await updateTimeOffStatus(id, timeOffId, data.status);

    await recordAuditEvent({
      action: "time_off_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "staff_time_off",
      entityId: timeOff.id,
      metadata: { status: timeOff.status },
      request,
    });

    return json({ timeOff });
  } catch (error) {
    return handleApiError(error);
  }
}
