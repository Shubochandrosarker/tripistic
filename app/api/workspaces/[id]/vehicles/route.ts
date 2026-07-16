import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageVehicles, canViewVehicles } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { vehicleListQuerySchema, vehicleSchema } from "@/lib/validation";
import { createVehicle, listVehicles } from "@/lib/vehicles/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewVehicles(membership.role)) {
      throw forbidden("You do not have permission to view the fleet.");
    }

    const url = new URL(request.url);
    const query = vehicleListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { vehicles, total } = await listVehicles(id, query);
    return json({ vehicles, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageVehicles(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the fleet.");
    }

    const body = await request.json().catch(() => null);
    const data = vehicleSchema.parse(body);
    const vehicle = await createVehicle(id, {
      ...data,
      insuranceExpiresOn: data.insuranceExpiresOn ? new Date(`${data.insuranceExpiresOn}T00:00:00.000Z`) : undefined,
      registrationExpiresOn: data.registrationExpiresOn
        ? new Date(`${data.registrationExpiresOn}T00:00:00.000Z`)
        : undefined,
    });

    await recordAuditEvent({
      action: "vehicle_created",
      workspaceId: id,
      userId: user.id,
      entityType: "vehicle",
      entityId: vehicle.id,
      metadata: { name: vehicle.name, type: vehicle.type },
      request,
    });

    return json({ vehicle }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
