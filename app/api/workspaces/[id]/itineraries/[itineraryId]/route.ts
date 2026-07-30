import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries, canViewItineraries } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateItinerarySchema } from "@/lib/validation";
import { requireItinerary, updateItinerary } from "@/lib/itinerary/service";
import { serializeItinerary } from "@/lib/itinerary/serializers";

type Params = { params: Promise<{ id: string; itineraryId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, itineraryId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canViewItineraries(membership.role)) {
      throw forbidden("You do not have permission to view itineraries.");
    }
    const itinerary = await requireItinerary(id, itineraryId);
    return json({ itinerary: serializeItinerary(itinerary) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, itineraryId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit itineraries.");
    }

    const body = await request.json().catch(() => null);
    const data = updateItinerarySchema.parse(body);
    const itinerary = await updateItinerary(id, itineraryId, {
      ...data,
      startDate: data.startDate === null ? null : data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : undefined,
    });

    await recordAuditEvent({
      action: "itinerary_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary",
      entityId: itinerary.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ itinerary: serializeItinerary(itinerary) });
  } catch (error) {
    return handleApiError(error);
  }
}
