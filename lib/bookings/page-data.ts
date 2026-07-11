import { prisma } from "@/lib/db";

/** Shared loader for the public tour booking page and its embed counterpart — one query shape, two presentations. */
export async function getTourBookingPageData(workspaceSlug: string, tourSlug: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug, status: "active", deletedAt: null },
  });
  if (!workspace) return null;

  const tour = await prisma.tour.findFirst({
    where: { workspaceId: workspace.id, slug: tourSlug, status: "active", visibility: "public", deletedAt: null },
  });
  if (!tour) return null;

  const [addons, availabilities] = await Promise.all([
    prisma.tourAddon.findMany({
      where: { tourId: tour.id, workspaceId: workspace.id, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.availability.findMany({
      where: { tourId: tour.id, workspaceId: workspace.id, status: "scheduled", startsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
  ]);

  return { workspace, tour, addons, availabilities };
}
