import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVehicles, canViewVehicles } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateVehicleSchema } from "@/lib/validation";
import { archiveVehicle, requireVehicle, updateVehicle } from "@/lib/vehicles/service";

type Params = { params: Promise<{ id: string; vehicleId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, vehicleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewVehicles(membership.role)) {
      throw forbidden("You do not have permission to view the fleet.");
    }
    const vehicle = await requireVehicle(id, vehicleId);
    return json({ vehicle });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, vehicleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageVehicles(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the fleet.");
    }

    const body = await request.json().catch(() => null);
    const data = updateVehicleSchema.parse(body);
    const vehicle = await updateVehicle(id, vehicleId, {
      ...data,
      insuranceExpiresOn: data.insuranceExpiresOn ? new Date(`${data.insuranceExpiresOn}T00:00:00.000Z`) : undefined,
      registrationExpiresOn: data.registrationExpiresOn
        ? new Date(`${data.registrationExpiresOn}T00:00:00.000Z`)
        : undefined,
    });

    await recordAuditEvent({
      action: "vehicle_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "vehicle",
      entityId: vehicle.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ vehicle });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, vehicleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageVehicles(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the fleet.");
    }

    const vehicle = await archiveVehicle(id, vehicleId);

    await recordAuditEvent({
      action: "vehicle_archived",
      workspaceId: id,
      userId: user.id,
      entityType: "vehicle",
      entityId: vehicle.id,
      metadata: { name: vehicle.name },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
