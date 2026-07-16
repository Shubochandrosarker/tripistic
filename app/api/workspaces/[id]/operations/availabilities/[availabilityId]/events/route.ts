import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewOperations } from "@/lib/auth/permissions";
import { listOpsEvents } from "@/lib/operations/service";

type Params = { params: Promise<{ id: string; availabilityId: string }> };

/** Full ops timeline for a departure — status changes, notes, check-ins, incidents, route changes. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewOperations(membership.role)) {
      throw forbidden("You do not have permission to view this departure's timeline.");
    }
    const events = await listOpsEvents(id, availabilityId);
    return json({
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        message: e.message,
        actorName: e.actor?.name ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
