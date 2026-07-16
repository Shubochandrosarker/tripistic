import { TZDate } from "@date-fns/tz";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import { OPS_STATUS_TRANSITIONS, type OpsStatusValue } from "@/lib/constants";
import { sendDepartureDelayedNotices } from "@/lib/messaging/service";
import { requireAssignableMember } from "@/lib/guides/service";
import { requireActiveVehicle } from "@/lib/vehicles/service";

/** Local-midnight-to-local-midnight UTC instants for "YYYY-MM-DD" in `timezone` — same TZDate approach as lib/tours/schedule.ts. */
export function dayBoundsInTz(dateKey: string, timezone: string): { dayStart: Date; dayEnd: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new TZDate(year, month - 1, day, 0, 0, 0, timezone);
  const end = new TZDate(year, month - 1, day + 1, 0, 0, 0, timezone);
  return { dayStart: new Date(start.getTime()), dayEnd: new Date(end.getTime()) };
}

const BOARD_INCLUDE = {
  tour: { select: { id: true, title: true, location: true } },
  guide: { select: { id: true, user: { select: { name: true } } } },
  driver: { select: { id: true, user: { select: { name: true } } } },
  vehicle: { select: { id: true, name: true } },
  /// `bookedCount` (the availability's own denormalized column, kept in
  /// sync by the booking transaction) already gives the total reserved
  /// seats — this relation is only for the check-in count on top of that.
  bookings: {
    where: { status: "confirmed", checkedInAt: { not: null } },
    select: { id: true },
  },
} as const;

/** Departures for one calendar day, in the workspace's own timezone semantics (caller passes already-resolved UTC bounds). */
export async function listDeparturesForDate(workspaceId: string, dayStart: Date, dayEnd: Date) {
  return prisma.availability.findMany({
    where: {
      workspaceId,
      startsAt: { gte: dayStart, lt: dayEnd },
      status: "scheduled",
    },
    orderBy: { startsAt: "asc" },
    include: BOARD_INCLUDE,
  });
}

export async function requireAvailabilityForOps(workspaceId: string, availabilityId: string) {
  const availability = await prisma.availability.findFirst({
    where: { id: availabilityId, workspaceId },
    include: BOARD_INCLUDE,
  });
  if (!availability) throw notFound("Departure not found");
  return availability;
}

export type TransitionOpsStatusInput = {
  status: OpsStatusValue;
  delayMinutes?: number;
  message?: string;
  notifyGuests?: boolean;
  actorUserId: string | null;
};

/**
 * The single path for every ops-status change on a departure — validates
 * the transition against `OPS_STATUS_TRANSITIONS`, updates the
 * Availability row, and writes an OpsEvent (append-only timeline, same
 * pattern as BookingStatusEvent). "Delayed Tour Automation": when the new
 * status is `delayed` and `notifyGuests` is set, queues a delay-notice
 * email to every confirmed guest via lib/messaging/service.ts — reusing
 * the same tracked-send infrastructure the rest of the app already uses,
 * not a new notification pipeline.
 */
export async function transitionOpsStatus(
  workspaceId: string,
  availabilityId: string,
  input: TransitionOpsStatusInput,
) {
  const availability = await prisma.availability.findFirst({ where: { id: availabilityId, workspaceId } });
  if (!availability) throw notFound("Departure not found");

  const allowed = OPS_STATUS_TRANSITIONS[availability.opsStatus as OpsStatusValue] ?? [];
  if (availability.opsStatus !== input.status && !allowed.includes(input.status)) {
    throw badRequest(
      `Cannot move a departure from "${availability.opsStatus}" to "${input.status}".`,
    );
  }

  const [updated] = await prisma.$transaction([
    prisma.availability.update({
      where: { id: availabilityId },
      data: {
        opsStatus: input.status,
        delayMinutes: input.status === "delayed" ? (input.delayMinutes ?? null) : null,
        opsUpdatedAt: new Date(),
      },
    }),
    prisma.opsEvent.create({
      data: {
        workspaceId,
        availabilityId,
        type: "status_changed",
        fromStatus: availability.opsStatus,
        toStatus: input.status,
        message: input.message ?? null,
        actorUserId: input.actorUserId,
      },
    }),
  ]);

  let notifiedCount = 0;
  if (input.status === "delayed" && input.notifyGuests) {
    notifiedCount = await sendDepartureDelayedNotices(availabilityId, input.delayMinutes ?? null, input.message ?? null);
    await prisma.opsEvent.create({
      data: {
        workspaceId,
        availabilityId,
        type: "customer_notified",
        message: `Delay notice sent to ${notifiedCount} guest${notifiedCount === 1 ? "" : "s"}.`,
        actorUserId: input.actorUserId,
      },
    });
  }

  return { availability: updated, notifiedCount };
}

export async function addOpsNote(workspaceId: string, availabilityId: string, message: string, actorUserId: string | null) {
  const availability = await prisma.availability.findFirst({ where: { id: availabilityId, workspaceId } });
  if (!availability) throw notFound("Departure not found");

  return prisma.opsEvent.create({
    data: { workspaceId, availabilityId, type: "note", message, actorUserId },
  });
}

export async function listOpsEvents(workspaceId: string, availabilityId: string) {
  return prisma.opsEvent.findMany({
    where: { workspaceId, availabilityId },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true } } },
  });
}

export type AssignDeparturePartyInput = {
  guideId?: string | null;
  driverId?: string | null;
  vehicleId?: string | null;
};

/** Dispatch quick-assign — sets guide/driver/vehicle on a departure in one call, reusing the same eligibility checks the tour availability routes use. */
export async function assignDepartureParty(workspaceId: string, availabilityId: string, input: AssignDeparturePartyInput) {
  const availability = await prisma.availability.findFirst({ where: { id: availabilityId, workspaceId } });
  if (!availability) throw notFound("Departure not found");

  if (input.guideId) await requireAssignableMember(workspaceId, input.guideId);
  if (input.driverId) await requireAssignableMember(workspaceId, input.driverId);
  if (input.vehicleId) await requireActiveVehicle(workspaceId, input.vehicleId);

  return prisma.availability.update({
    where: { id: availabilityId },
    data: {
      ...(input.guideId !== undefined ? { guideId: input.guideId } : {}),
      ...(input.driverId !== undefined ? { driverId: input.driverId } : {}),
      ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
    },
  });
}

export async function checkInBooking(workspaceId: string, bookingId: string, actorUserId: string | null) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, workspaceId } });
  if (!booking) throw notFound("Booking not found");
  if (booking.status !== "confirmed") {
    throw badRequest("Only confirmed bookings can be checked in.");
  }

  const [updated] = await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { checkedInAt: new Date() } }),
    prisma.opsEvent.create({
      data: {
        workspaceId,
        availabilityId: booking.availabilityId,
        type: "checkin",
        message: `Checked in ${booking.guestFirstName} ${booking.guestLastName} (${booking.reference}).`,
        actorUserId,
      },
    }),
  ]);

  return updated;
}
