import type { Booking, BookingStatus } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { conflict, notFound } from "@/lib/api";
import { recordAuditEvent, type AuditAction } from "@/lib/audit/audit-log";
import { canTransition } from "./status";

/**
 * `system` is used by payment-webhook-driven and expiration-sweep-driven
 * transitions — no human/guest initiated the change directly.
 */
export type TransitionActor = { kind: "public" } | { kind: "user"; userId: string } | { kind: "system" };

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
 * The state-machine core, operating on a caller-supplied `Db` (either the
 * top-level `prisma` client or a transaction client). Every transition is a
 * single conditional `UPDATE ... WHERE status = <expected>` so a concurrent
 * duplicate request can flip the row at most once; capacity is released
 * exactly when — and only when — this call is the one that actually moves
 * the booking into `cancelled`. Does NOT record the audit event — callers
 * that open their own transaction (payment webhook, expiration sweep) need
 * the audit write to happen only after THEIR outer transaction commits, so
 * that responsibility stays with the two exported wrappers below.
 */
async function applyTransition(
  tx: Db,
  input: TransitionBookingStatusInput,
): Promise<TransitionBookingStatusResult> {
  const { workspaceId, bookingId, toStatus, actor, note } = input;

  const existing = await tx.booking.findFirst({ where: { id: bookingId, workspaceId } });
  if (!existing) throw notFound("Booking not found");

  if (existing.status === toStatus) {
    return { booking: existing, alreadyInStatus: true, seatsReleased: 0, fromStatus: existing.status };
  }

  if (!canTransition(existing.status, toStatus)) {
    throw conflict(`This booking is ${existing.status} and cannot be moved to ${toStatus} directly.`);
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
}

/**
 * The one canonical status-transition path (also used for cancellation —
 * there is no separate cancel-only code path to keep in sync). Opens its
 * own transaction and records the audit event after it commits.
 */
export async function transitionBookingStatus(
  input: TransitionBookingStatusInput,
): Promise<TransitionBookingStatusResult> {
  const result = await prisma.$transaction((tx) => applyTransition(tx, input));

  if (!result.alreadyInStatus) {
    await recordAuditEvent({
      action: AUDIT_ACTION_BY_STATUS[input.toStatus],
      workspaceId: input.workspaceId,
      userId: input.actor.kind === "user" ? input.actor.userId : null,
      entityType: "booking",
      entityId: input.bookingId,
      metadata: {
        reference: result.booking.reference,
        fromStatus: result.fromStatus,
        toStatus: input.toStatus,
        seatsReleased: result.seatsReleased,
      },
    });
  }

  return result;
}

/**
 * Composable variant for callers that need this transition to commit or
 * roll back atomically together with other writes in a larger transaction
 * — namely the payment webhook (payment succeeded + booking confirmed must
 * never be visible independently of each other) and, indirectly, the
 * invariant the expiration sweep in lib/payments/expiration.ts relies on
 * (see docs/17_PHASE_4_IMPLEMENTATION_PLAN.md §9). The caller owns both the
 * transaction and the post-commit `recordAuditEvent` call.
 */
export async function transitionBookingStatusInTx(
  tx: Db,
  input: TransitionBookingStatusInput,
): Promise<TransitionBookingStatusResult> {
  return applyTransition(tx, input);
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
