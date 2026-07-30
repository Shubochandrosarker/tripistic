import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkforce, canViewWorkforce } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createTimeOffSchema } from "@/lib/validation";
import { createTimeOff, listTimeOff } from "@/lib/workforce/service";

type Params = { params: Promise<{ id: string; memberId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "guide_scheduling" });
    if (!canViewWorkforce(membership.role)) {
      throw forbidden("You do not have permission to view time off.");
    }
    const timeOff = await listTimeOff(id, memberId);
    return json({ timeOff });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "guide_scheduling" });
    if (!canManageWorkforce(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage time off.");
    }

    const body = await request.json().catch(() => null);
    const data = createTimeOffSchema.parse(body);
    const timeOff = await createTimeOff(id, memberId, {
      ...data,
      startsOn: new Date(`${data.startsOn}T00:00:00.000Z`),
      endsOn: new Date(`${data.endsOn}T00:00:00.000Z`),
    });

    await recordAuditEvent({
      action: "time_off_created",
      workspaceId: id,
      userId: user.id,
      entityType: "staff_time_off",
      entityId: timeOff.id,
      metadata: { memberId, status: timeOff.status },
      request,
    });

    return json({ timeOff }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
