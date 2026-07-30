import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVehicles } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createFuelLogSchema } from "@/lib/validation";
import { createFuelLog } from "@/lib/vehicles/service";

type Params = { params: Promise<{ id: string; vehicleId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, vehicleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "vehicles" });
    if (!canManageVehicles(membership.role)) {
      throw forbidden("Only workspace owners and admins can log fuel costs.");
    }

    const body = await request.json().catch(() => null);
    const data = createFuelLogSchema.parse(body);
    const log = await createFuelLog(id, vehicleId, {
      ...data,
      loggedOn: new Date(`${data.loggedOn}T00:00:00.000Z`),
    });

    await recordAuditEvent({
      action: "fuel_log_created",
      workspaceId: id,
      userId: user.id,
      entityType: "vehicle_fuel_log",
      entityId: log.id,
      metadata: { vehicleId, costCents: log.costCents },
      request,
    });

    return json({ log }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
