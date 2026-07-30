import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateItineraryDaySchema } from "@/lib/validation";
import { updateItineraryDay } from "@/lib/itinerary/service";
import { serializeItineraryDay } from "@/lib/itinerary/serializers";

type Params = { params: Promise<{ id: string; itineraryId: string; dayId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, itineraryId, dayId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit itineraries.");
    }

    const body = await request.json().catch(() => null);
    const data = updateItineraryDaySchema.parse(body);
    const day = await updateItineraryDay(id, itineraryId, dayId, {
      ...data,
      date: data.date === null ? null : data.date ? new Date(`${data.date}T00:00:00.000Z`) : undefined,
    });

    await recordAuditEvent({
      action: "itinerary_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary_day",
      entityId: day.id,
      metadata: { itineraryId, fields: Object.keys(data).join(",") },
      request,
    });

    return json({ day: serializeItineraryDay(day) });
  } catch (error) {
    return handleApiError(error);
  }
}
