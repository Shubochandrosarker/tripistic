import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateItineraryItemSchema } from "@/lib/validation";
import { deleteItineraryItem, updateItineraryItem } from "@/lib/itinerary/service";
import { serializeItineraryItem } from "@/lib/itinerary/serializers";

type Params = { params: Promise<{ id: string; itineraryId: string; itemId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, itineraryId, itemId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit itineraries.");
    }

    const body = await request.json().catch(() => null);
    const data = updateItineraryItemSchema.parse(body);
    const item = await updateItineraryItem(id, itineraryId, itemId, data);

    await recordAuditEvent({
      action: "itinerary_item_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary_item",
      entityId: item.id,
      metadata: { itineraryId, fields: Object.keys(data).join(",") },
      request,
    });

    return json({ item: serializeItineraryItem(item) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, itineraryId, itemId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit itineraries.");
    }

    await deleteItineraryItem(id, itineraryId, itemId);

    await recordAuditEvent({
      action: "itinerary_item_deleted",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary_item",
      entityId: itemId,
      metadata: { itineraryId },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
