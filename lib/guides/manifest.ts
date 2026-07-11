import { prisma } from "@/lib/db";

export type ManifestParticipant = {
  id: string;
  firstName: string;
  lastName: string;
  notes: string | null;
  /** `null` when the tour doesn't require a waiver — the field is not applicable, not "unsigned." */
  waiverSigned: boolean | null;
};

export type ManifestBooking = {
  id: string;
  reference: string;
  participantCount: number;
  guestFirstName: string;
  guestLastName: string;
  guestPhone: string | null;
  participants: ManifestParticipant[];
};

export type ManifestDeparture = {
  id: string;
  tourTitle: string;
  location: string | null;
  meetingPoint: string | null;
  startsAt: string;
  endsAt: string;
  waiverRequired: boolean;
  bookings: ManifestBooking[];
};

/**
 * "Guide sees only assigned departures" (docs/02 §6 AC) — scoped entirely
 * by `Availability.guideId === memberId`, never by role. Any active member
 * may call this; it is simply empty for anyone with no assignments (see
 * docs/21 §6 for why this is not a role gate).
 *
 * Guest contact info and participant notes are included deliberately — a
 * guide leading this specific departure has a real operational need to
 * reach their own group and know about dietary/medical notes, unlike the
 * general `guide` role's total lack of booking access everywhere else.
 */
export async function getManifestForMember(
  workspaceId: string,
  memberId: string,
  options: { from?: Date } = {},
): Promise<ManifestDeparture[]> {
  const from = options.from ?? new Date();
  const availabilities = await prisma.availability.findMany({
    where: {
      workspaceId,
      guideId: memberId,
      status: "scheduled",
      startsAt: { gte: from },
    },
    orderBy: { startsAt: "asc" },
    include: {
      tour: { select: { title: true, location: true, meetingPoint: true, waiverRequired: true } },
      bookings: {
        where: { status: "confirmed" },
        include: {
          participants: { include: { waiverSignature: { select: { id: true } } } },
        },
      },
    },
  });

  return availabilities.map((availability) => ({
    id: availability.id,
    tourTitle: availability.tour.title,
    location: availability.tour.location,
    meetingPoint: availability.tour.meetingPoint,
    startsAt: availability.startsAt.toISOString(),
    endsAt: availability.endsAt.toISOString(),
    waiverRequired: availability.tour.waiverRequired,
    bookings: availability.bookings.map((booking) => ({
      id: booking.id,
      reference: booking.reference,
      participantCount: booking.participantCount,
      guestFirstName: booking.guestFirstName,
      guestLastName: booking.guestLastName,
      guestPhone: booking.guestPhone,
      participants: booking.participants.map((participant) => ({
        id: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
        notes: participant.notes,
        waiverSigned: availability.tour.waiverRequired ? participant.waiverSignature != null : null,
      })),
    })),
  }));
}
