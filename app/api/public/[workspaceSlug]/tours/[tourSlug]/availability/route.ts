import { prisma } from "@/lib/db";
import { handleApiError, noStoreJson } from "@/lib/api";
import { requirePublicTour, requirePublicWorkspace } from "@/lib/tenancy/public";
import { availabilityQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string; tourSlug: string }> };

/** Public departure list for a tour — future, scheduled only. Never exposes bookedCount, only remaining capacity. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { workspaceSlug, tourSlug } = await params;
    const workspace = await requirePublicWorkspace(workspaceSlug);
    const tour = await requirePublicTour(workspace.id, tourSlug);

    const url = new URL(request.url);
    const query = availabilityQuerySchema.parse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      partySize: url.searchParams.get("partySize") ?? undefined,
    });

    const partySize = query.partySize ?? 1;
    const from = query.from && query.from.getTime() > Date.now() ? query.from : new Date();

    const availabilities = await prisma.availability.findMany({
      where: {
        tourId: tour.id,
        workspaceId: workspace.id,
        status: "scheduled",
        startsAt: { gte: from, ...(query.to ? { lte: query.to } : {}) },
      },
      orderBy: { startsAt: "asc" },
      take: 200,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        bookedCount: true,
        priceOverride: true,
      },
    });

    return noStoreJson({
      timezone: workspace.timezone,
      currency: tour.currency,
      departures: availabilities.map((slot) => {
        const remainingCapacity = Math.max(slot.capacity - slot.bookedCount, 0);
        return {
          id: slot.id,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          remainingCapacity,
          soldOut: remainingCapacity <= 0,
          fitsPartySize: remainingCapacity >= partySize,
          unitPrice: slot.priceOverride ?? tour.basePrice,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
