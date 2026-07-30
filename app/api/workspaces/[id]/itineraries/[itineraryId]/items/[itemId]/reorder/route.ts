import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries } from "@/lib/auth/permissions";
import { reorderItineraryItemSchema } from "@/lib/validation";
import { reorderItineraryItem } from "@/lib/itinerary/service";

type Params = { params: Promise<{ id: string; itineraryId: string; itemId: string }> };

/** Move an item up/down within its day — accessible alternative to drag-and-drop. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, itineraryId, itemId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit itineraries.");
    }

    const body = await request.json().catch(() => null);
    const data = reorderItineraryItemSchema.parse(body);
    await reorderItineraryItem(id, itineraryId, itemId, data.direction);

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
