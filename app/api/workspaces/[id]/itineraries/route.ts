import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries, canViewItineraries } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { generateItinerarySchema, itineraryListQuerySchema } from "@/lib/validation";
import { generateAndSaveItinerary, listItineraries } from "@/lib/itinerary/service";
import { serializeItinerary } from "@/lib/itinerary/serializers";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canViewItineraries(membership.role)) {
      throw forbidden("You do not have permission to view itineraries.");
    }

    const url = new URL(request.url);
    const query = itineraryListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { itineraries, total } = await listItineraries(id, query);
    return json({
      itineraries: itineraries.map((it) => ({
        id: it.id,
        title: it.title,
        destination: it.destination,
        dayCount: it.dayCount,
        status: it.status,
        itemCount: it._count.items,
        customer: it.customer,
        createdAt: it.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Generates a full day-by-day itinerary from a short brief — the "AI Itinerary Builder". */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can build itineraries.");
    }

    const body = await request.json().catch(() => null);
    const data = generateItinerarySchema.parse(body);
    const itinerary = await generateAndSaveItinerary(id, {
      title: data.title,
      destination: data.destination,
      dayCount: data.dayCount,
      startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : undefined,
      travelerCount: data.travelerCount ?? 2,
      currency: data.currency,
      budgetTier: data.budgetTier,
      customerId: data.customerId,
      leadId: data.leadId,
      createdById: user.id,
    });

    await recordAuditEvent({
      action: "itinerary_generated",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary",
      entityId: itinerary.id,
      metadata: { title: itinerary.title, dayCount: itinerary.dayCount },
      request,
    });

    return json({ itinerary: serializeItinerary(itinerary) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
