import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createItineraryItemSchema } from "@/lib/validation";
import { createItineraryItem } from "@/lib/itinerary/service";
import { serializeItineraryItem } from "@/lib/itinerary/serializers";

type Params = { params: Promise<{ id: string; itineraryId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, itineraryId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit itineraries.");
    }

    const body = await request.json().catch(() => null);
    const data = createItineraryItemSchema.parse(body);
    const item = await createItineraryItem(id, itineraryId, data);

    await recordAuditEvent({
      action: "itinerary_item_created",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary_item",
      entityId: item.id,
      metadata: { itineraryId, type: item.type },
      request,
    });

    return json({ item: serializeItineraryItem(item) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
