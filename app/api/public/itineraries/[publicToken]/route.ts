import { noStoreJson, notFound, handleApiError } from "@/lib/api";
import { findItineraryByPublicToken } from "@/lib/itinerary/service";
import { serializeItinerary } from "@/lib/itinerary/serializers";

type Params = { params: Promise<{ publicToken: string }> };

/** Public (unauthenticated) itinerary share view — the Customer Portal share link. Never cached: the token grants access, and content changes as the itinerary is edited. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    const itinerary = await findItineraryByPublicToken(publicToken);
    if (!itinerary) throw notFound("Not found");

    return noStoreJson({
      itinerary: serializeItinerary(itinerary),
      workspaceName: itinerary.workspace.name,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
