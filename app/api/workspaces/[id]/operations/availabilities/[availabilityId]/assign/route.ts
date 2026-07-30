import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageOperations } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { assignDeparturePartySchema } from "@/lib/validation";
import { assignDepartureParty } from "@/lib/operations/service";

type Params = { params: Promise<{ id: string; availabilityId: string }> };

/** Dispatch quick-assign — guide/driver/vehicle for a departure in one call. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "operations_dispatch" });
    if (!canManageOperations(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can assign departures.");
    }

    const body = await request.json().catch(() => null);
    const data = assignDeparturePartySchema.parse(body);
    const availability = await assignDepartureParty(id, availabilityId, data);

    await recordAuditEvent({
      action: "departure_party_assigned",
      workspaceId: id,
      userId: user.id,
      entityType: "availability",
      entityId: availability.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ availability });
  } catch (error) {
    return handleApiError(error);
  }
}
