import { prisma } from "@/lib/db";
import { handleApiError, noStoreJson } from "@/lib/api";
import { requirePublicTour, requirePublicWorkspace } from "@/lib/tenancy/public";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string; tourSlug: string }> };

/** Public tour detail page data — safe fields only, plus active add-ons. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceSlug, tourSlug } = await params;
    const workspace = await requirePublicWorkspace(workspaceSlug);
    const tour = await requirePublicTour(workspace.id, tourSlug);

    const addons = await prisma.tourAddon.findMany({
      where: { tourId: tour.id, workspaceId: workspace.id, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, description: true, price: true, maxPerBooking: true },
    });

    return noStoreJson({
      workspace: { name: workspace.name, slug: workspace.slug, timezone: workspace.timezone },
      tour: {
        slug: tour.slug,
        title: tour.title,
        description: tour.description,
        kind: tour.kind,
        durationMinutes: tour.durationMinutes,
        durationDays: tour.durationDays,
        location: tour.location,
        meetingPoint: tour.meetingPoint,
        capacity: tour.capacity,
        basePrice: tour.basePrice,
        currency: tour.currency,
        cancellationPolicy: tour.cancellationPolicy,
        waiverRequired: tour.waiverRequired,
        coverImageUrl: tour.coverImageUrl,
      },
      addons,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
