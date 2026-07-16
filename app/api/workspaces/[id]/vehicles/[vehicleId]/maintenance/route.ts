import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVehicles } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createMaintenanceRecordSchema } from "@/lib/validation";
import { createMaintenanceRecord } from "@/lib/vehicles/service";

type Params = { params: Promise<{ id: string; vehicleId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, vehicleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageVehicles(membership.role)) {
      throw forbidden("Only workspace owners and admins can log maintenance.");
    }

    const body = await request.json().catch(() => null);
    const data = createMaintenanceRecordSchema.parse(body);
    const record = await createMaintenanceRecord(id, vehicleId, {
      ...data,
      performedOn: new Date(`${data.performedOn}T00:00:00.000Z`),
      nextDueOn: data.nextDueOn ? new Date(`${data.nextDueOn}T00:00:00.000Z`) : undefined,
    });

    await recordAuditEvent({
      action: "maintenance_record_created",
      workspaceId: id,
      userId: user.id,
      entityType: "vehicle_maintenance_record",
      entityId: record.id,
      metadata: { vehicleId, type: record.type },
      request,
    });

    return json({ record }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
