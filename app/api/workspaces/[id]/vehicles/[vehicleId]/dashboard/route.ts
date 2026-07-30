import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewVehicles } from "@/lib/auth/permissions";
import { computeVehicleDashboard } from "@/lib/vehicles/service";

type Params = { params: Promise<{ id: string; vehicleId: string }> };

/** Upcoming trips, expiry/maintenance alerts, and a simple profit rollup for one vehicle. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, vehicleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "vehicles" });
    if (!canViewVehicles(membership.role)) {
      throw forbidden("You do not have permission to view this vehicle.");
    }
    const dashboard = await computeVehicleDashboard(id, vehicleId);
    return json(dashboard);
  } catch (error) {
    return handleApiError(error);
  }
}
