import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkforce } from "@/lib/auth/permissions";
import { matchStaffQuerySchema } from "@/lib/validation";
import { requireTour, requireAvailability } from "@/lib/tours/service";
import { matchStaffForAvailability } from "@/lib/workforce/matching";

type Params = { params: Promise<{ id: string; tourId: string; availabilityId: string }> };

/** AI guide/driver matching — ranked candidates for this departure (docs Phase 6 spec). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id, tourId, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkforce(membership.role)) {
      throw forbidden("Only workspace owners and admins can view staff matching.");
    }
    await requireTour(id, tourId);
    await requireAvailability(id, tourId, availabilityId);

    const url = new URL(request.url);
    const query = matchStaffQuerySchema.parse({
      availabilityId,
      role: url.searchParams.get("role") || undefined,
      languages: url.searchParams.get("languages") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    const candidates = await matchStaffForAvailability(
      id,
      availabilityId,
      query.role,
      query.languages ?? [],
      query.limit,
    );

    return json({ candidates });
  } catch (error) {
    return handleApiError(error);
  }
}
