import type { Tour } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/api";

export type ArchiveTourResult = {
  tour: Tour;
  pausedSchedules: number;
  cancelledSlots: number;
};

/**
 * Canonical archive path — the only place a tour transitions to `archived`.
 * Both `PATCH .../tours/:tourId` (status → archived) and
 * `DELETE .../tours/:tourId` (soft delete) route through this so the two
 * flows can never diverge in behavior again: both pause active schedules and
 * cancel future unbooked departures. `softDelete` additionally hides the
 * tour from the catalog (`deletedAt` set); a plain archive keeps it visible
 * but inert.
 *
 * Blocks with a 409 when the tour has active (pending/confirmed) future
 * bookings — those must be handled (cancelled or completed) first. Booking
 * history is never destroyed by archiving.
 */
export async function archiveTour(input: {
  workspaceId: string;
  tourId: string;
  softDelete: boolean;
}): Promise<ArchiveTourResult> {
  const { workspaceId, tourId, softDelete } = input;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.tour.findFirst({
      where: { id: tourId, workspaceId, deletedAt: null },
    });
    if (!existing) throw notFound("Tour not found");

    const activeFutureBookings = await tx.booking.count({
      where: {
        tourId,
        workspaceId,
        status: { in: ["pending", "confirmed"] },
        departureStartsAt: { gt: new Date() },
      },
    });
    if (activeFutureBookings > 0) {
      throw conflict(
        `This tour has ${activeFutureBookings} active upcoming booking${activeFutureBookings === 1 ? "" : "s"}. ` +
          "Cancel or complete those bookings before archiving or deleting the tour.",
      );
    }

    const tour = await tx.tour.update({
      where: { id: existing.id },
      data: {
        status: "archived",
        ...(softDelete ? { deletedAt: new Date() } : {}),
      },
    });

    const pausedSchedules = await tx.tourSchedule.updateMany({
      where: { tourId, workspaceId, status: "active" },
      data: { status: "paused" },
    });

    const cancelledSlots = await tx.availability.updateMany({
      where: { tourId, workspaceId, status: "scheduled", startsAt: { gt: new Date() } },
      data: { status: "cancelled" },
    });

    return { tour, pausedSchedules: pausedSchedules.count, cancelledSlots: cancelledSlots.count };
  });
}
