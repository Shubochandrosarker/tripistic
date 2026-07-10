import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import { slugify } from "@/lib/utils";

/**
 * Tenant-scoped tour lookups. `workspaceId` must come from a verified
 * membership (requireWorkspaceAccess / getActiveWorkspace) — never from
 * client input alone. Missing or out-of-tenant rows read as 404.
 */

export async function requireTour(workspaceId: string, tourId: string) {
  const tour = await prisma.tour.findFirst({
    where: { id: tourId, workspaceId, deletedAt: null },
  });
  if (!tour) throw notFound("Tour not found");
  return tour;
}

export async function requireSchedule(workspaceId: string, tourId: string, scheduleId: string) {
  const schedule = await prisma.tourSchedule.findFirst({
    where: { id: scheduleId, tourId, workspaceId },
  });
  if (!schedule) throw notFound("Schedule not found");
  return schedule;
}

export async function requireAddon(workspaceId: string, tourId: string, addonId: string) {
  const addon = await prisma.tourAddon.findFirst({
    where: { id: addonId, tourId, workspaceId },
  });
  if (!addon) throw notFound("Add-on not found");
  return addon;
}

export async function requireAvailability(
  workspaceId: string,
  tourId: string,
  availabilityId: string,
) {
  const availability = await prisma.availability.findFirst({
    where: { id: availabilityId, tourId, workspaceId },
  });
  if (!availability) throw notFound("Departure not found");
  return availability;
}

/** Unique, url-safe tour slug within a workspace. */
export async function generateTourSlug(workspaceId: string, title: string) {
  const root = slugify(title);
  let candidate = root;
  let attempt = 1;
  while (attempt < 50) {
    const existing = await prisma.tour.findFirst({
      where: { workspaceId, slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${root}-${attempt}`;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/** Count of upcoming (future, scheduled) departures per tour or workspace. */
export async function countUpcomingSlots(workspaceId: string, tourId?: string) {
  return prisma.availability.count({
    where: {
      workspaceId,
      ...(tourId ? { tourId } : {}),
      status: "scheduled",
      startsAt: { gt: new Date() },
      tour: { deletedAt: null },
    },
  });
}
