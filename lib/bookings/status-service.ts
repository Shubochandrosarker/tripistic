import type { Booking, BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, notFound } from "@/lib/api";
import { recordAuditEvent, type AuditAction } from "@/lib/audit/audit-log";
import { canTransition } from "./status";

export type TransitionActor = { kind: "public" } | { kind: "user"; userId: string };

export type TransitionBookingStatusInput = {
  workspaceId: string;
  bookingId: string;
  toStatus: BookingStatus;
  actor: TransitionActor;
  note?: string;
};

export type TransitionBookingStatusResult = {
  booking: Booking;
  /** True when the booking was already in `toStatus` — a safe no-op, not an error. */
  alreadyInStatus: boolean;
  seatsReleased: number;
  fromStatus: BookingStatus;
};

const AUDIT_ACTION_BY_STATUS: Record<BookingStatus, AuditAction> = {
  pending: "booking_updated",
  confirmed: "booking_confirmed",
  cancelled: "booking_cancelled",
  completed: "booking_completed",
  no_show: "booking_marked_no_show",
};

/**
 * The one canonical status-transition path (also used for cancellation —
 * there is no separate cancel-only code path to keep in sync). Every
 * transition is a single conditional `UPDATE ... WHERE status = <expected>`
 * so a concurrent duplicate request can flip the row at most once; capacity
 * is released exactly when — and only when — this transaction is the one
 * that actually moves the booking into `cancelled`.
 */
export async function transitionBookingStatus(
  input: TransitionBookingStatusInput,
): Promise<TransitionBookingStatusResult> {
  const { workspaceId, bookingId, toStatus, actor, note } = input;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findFirst({ where: { id: bookingId, workspaceId } });
    if (!existing) throw notFound("Booking not found");

    if (existing.status === toStatus) {
      return { booking: existing, alreadyInStatus: true, seatsReleased: 0, fromStatus: existing.status };
    }

    if (!canTransition(existing.status, toStatus)) {
      throw conflict(
        `This booking is ${existing.status} and cannot be moved to ${toStatus} directly.`,
      );
    }

    const now = new Date();
    const flipped = await tx.booking.updateMany({
      where: { id: bookingId, workspaceId, status: existing.status },
      data: {
        status: toStatus,
        ...(toStatus === "confirmed" ? { confirmedAt: now } : {}),
        ...(toStatus === "cancelled" ? { cancelledAt: now } : {}),
        ...(toStatus === "completed" ? { completedAt: now } : {}),
      },
    });
    if (flipped.count === 0) {
      // Lost a race to another concurrent transition on the same booking.
      throw conflict("This booking was just updated by another request. Refresh and try again.");
    }

    let seatsReleased = 0;
    if (toStatus === "cancelled") {
      await tx.$executeRaw`
        UPDATE availabilities
        SET booked_count = GREATEST(booked_count - ${existing.participantCount}, 0), updated_at = now()
        WHERE id = ${existing.availabilityId} AND workspace_id = ${workspaceId}
      `;
      seatsReleased = existing.participantCount;
    }

    await tx.bookingStatusEvent.create({
      data: {
        workspaceId,
        bookingId,
        fromStatus: existing.status,
        toStatus,
        actorUserId: actor.kind === "user" ? actor.userId : null,
        note: note ?? null,
      },
    });

    const updated = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    return { booking: updated, alreadyInStatus: false, seatsReleased, fromStatus: existing.status };
  });

  if (!result.alreadyInStatus) {
    await recordAuditEvent({
      action: AUDIT_ACTION_BY_STATUS[toStatus],
      workspaceId,
      userId: actor.kind === "user" ? actor.userId : null,
      entityType: "booking",
      entityId: bookingId,
      metadata: {
        reference: result.booking.reference,
        fromStatus: result.fromStatus,
        toStatus,
        seatsReleased: result.seatsReleased,
      },
    });
  }

  return result;
}

/** Convenience wrapper — the cancellation path referenced throughout the docs and master prompt. */
export async function cancelBooking(input: {
  workspaceId: string;
  bookingId: string;
  actor: TransitionActor;
  reason?: string;
}): Promise<TransitionBookingStatusResult> {
  return transitionBookingStatus({
    workspaceId: input.workspaceId,
    bookingId: input.bookingId,
    toStatus: "cancelled",
    actor: input.actor,
    note: input.reason,
  });
}
