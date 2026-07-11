import type { WorkspaceRole } from "@prisma/client";
import { canViewBookingPII } from "@/lib/auth/permissions";
import type { BookingWithRelations } from "./service";

/**
 * Everything a guest may see on their own confirmation page — no operator
 * notes or internal database IDs. `publicToken` IS included: it's how the
 * confirmation page is addressed at all (the create response is how the
 * client learns where to navigate), and returning it to whoever already
 * holds it (the booking creator, or a caller who supplied it in the GET
 * request) isn't a disclosure — it's the same value already in that URL.
 */
export type PublicBookingConfirmation = {
  reference: string;
  publicToken: string;
  status: string;
  tourTitle: string;
  location: string | null;
  meetingPoint: string | null;
  departureStartsAt: string;
  departureEndsAt: string;
  guestFirstName: string;
  guestLastName: string;
  participantCount: number;
  participants: { firstName: string; lastName: string }[];
  addons: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
  unitPrice: number;
  subtotal: number;
  addonsTotal: number;
  totalAmount: number;
  currency: string;
  cancellationPolicy: string | null;
  createdAt: string;
};

export function serializePublicBookingConfirmation(
  booking: BookingWithRelations,
): PublicBookingConfirmation {
  return {
    reference: booking.reference,
    publicToken: booking.publicToken,
    status: booking.status,
    tourTitle: booking.tourTitleSnapshot,
    location: booking.locationSnapshot,
    meetingPoint: booking.meetingPointSnapshot,
    departureStartsAt: booking.departureStartsAt.toISOString(),
    departureEndsAt: booking.departureEndsAt.toISOString(),
    guestFirstName: booking.guestFirstName,
    guestLastName: booking.guestLastName,
    participantCount: booking.participantCount,
    participants: booking.participants.map((p) => ({ firstName: p.firstName, lastName: p.lastName })),
    addons: booking.addonSelections.map((a) => ({
      name: a.nameSnapshot,
      quantity: a.quantity,
      unitPrice: a.unitPrice,
      totalPrice: a.totalPrice,
    })),
    unitPrice: booking.unitPrice,
    subtotal: booking.subtotal,
    addonsTotal: booking.addonsTotal,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    cancellationPolicy: booking.cancellationPolicySnapshot,
    createdAt: booking.createdAt.toISOString(),
  };
}

export type InternalBookingListItem = {
  id: string;
  reference: string;
  status: string;
  source: string;
  guestName: string;
  guestEmail: string | null;
  tourTitle: string;
  departureStartsAt: string;
  participantCount: number;
  totalAmount: number;
  currency: string;
  createdAt: string;
};

function baseListItem(booking: BookingWithRelations, role: WorkspaceRole): InternalBookingListItem {
  const showPII = canViewBookingPII(role);
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    source: booking.source,
    guestName: `${booking.guestFirstName} ${booking.guestLastName}`,
    guestEmail: showPII ? booking.guestEmail : null,
    tourTitle: booking.tourTitleSnapshot,
    departureStartsAt: booking.departureStartsAt.toISOString(),
    participantCount: booking.participantCount,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    createdAt: booking.createdAt.toISOString(),
  };
}

export function serializeBookingListItem(
  booking: BookingWithRelations,
  role: WorkspaceRole,
): InternalBookingListItem {
  return baseListItem(booking, role);
}

export type InternalBookingDetail = InternalBookingListItem & {
  guestPhone: string | null;
  guestNotes: string | null;
  operatorNotes: string | null;
  publicToken: string | null;
  location: string | null;
  meetingPoint: string | null;
  cancellationPolicy: string | null;
  departureEndsAt: string;
  unitPrice: number;
  subtotal: number;
  addonsTotal: number;
  createdById: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  participants: { firstName: string; lastName: string; email: string | null; phone: string | null; notes: string | null }[];
  addonSelections: { name: string; quantity: number; unitPrice: number; totalPrice: number }[];
  statusEvents: {
    fromStatus: string | null;
    toStatus: string;
    actorUserId: string | null;
    actorName: string | null;
    note: string | null;
    createdAt: string;
  }[];
};

type BookingDetailSource = BookingWithRelations & {
  statusEvents?: {
    fromStatus: string | null;
    toStatus: string;
    actorUserId: string | null;
    note: string | null;
    createdAt: Date;
    actor?: { name: string } | null;
  }[];
};

/** Full detail view, redacted per role. Viewer never receives guest email/phone/notes or operator notes. */
export function serializeBookingDetail(
  booking: BookingDetailSource,
  role: WorkspaceRole,
): InternalBookingDetail {
  const showPII = canViewBookingPII(role);
  return {
    ...baseListItem(booking, role),
    guestPhone: showPII ? booking.guestPhone : null,
    guestNotes: showPII ? booking.guestNotes : null,
    operatorNotes: showPII ? booking.operatorNotes : null,
    publicToken: showPII ? booking.publicToken : null,
    location: booking.locationSnapshot,
    meetingPoint: booking.meetingPointSnapshot,
    cancellationPolicy: booking.cancellationPolicySnapshot,
    departureEndsAt: booking.departureEndsAt.toISOString(),
    unitPrice: booking.unitPrice,
    subtotal: booking.subtotal,
    addonsTotal: booking.addonsTotal,
    createdById: booking.createdById,
    confirmedAt: booking.confirmedAt?.toISOString() ?? null,
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    participants: booking.participants.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      email: showPII ? p.email : null,
      phone: showPII ? p.phone : null,
      notes: showPII ? p.notes : null,
    })),
    addonSelections: booking.addonSelections.map((a) => ({
      name: a.nameSnapshot,
      quantity: a.quantity,
      unitPrice: a.unitPrice,
      totalPrice: a.totalPrice,
    })),
    statusEvents: (booking.statusEvents ?? []).map((e) => ({
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorUserId: e.actorUserId,
      actorName: e.actor?.name ?? null,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
