import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageOperations } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { opsStatusTransitionSchema } from "@/lib/validation";
import { transitionOpsStatus } from "@/lib/operations/service";

type Params = { params: Promise<{ id: string; availabilityId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageOperations(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can update departure status.");
    }

    const body = await request.json().catch(() => null);
    const data = opsStatusTransitionSchema.parse(body);
    const { availability, notifiedCount } = await transitionOpsStatus(id, availabilityId, {
      ...data,
      actorUserId: user.id,
    });

    await recordAuditEvent({
      action: "ops_status_changed",
      workspaceId: id,
      userId: user.id,
      entityType: "availability",
      entityId: availability.id,
      metadata: { toStatus: data.status, notifiedCount },
      request,
    });

    return json({ availability, notifiedCount });
  } catch (error) {
    return handleApiError(error);
  }
}
