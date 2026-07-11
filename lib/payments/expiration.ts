import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";

export type ExpireOutcome = { expired: true; workspaceId: string; bookingId: string; paymentId: string } | null;

/**
 * Deliberately NOT built on top of `transitionBookingStatus` — see
 * docs/17_PHASE_4_IMPLEMENTATION_PLAN.md §9 for why. That function's state
 * machine allows `confirmed -> cancelled` (a legitimate operator action), so
 * a generic "cancel this booking id" call here could race a webhook that
 * just confirmed the same booking and wrongly cancel a paid reservation.
 * This instead runs one conditional `UPDATE ... WHERE status = 'pending'`
 * scoped to exactly `pending -> cancelled` — if the webhook already won
 * (booking now `confirmed`), this matches zero rows and safely no-ops. That
 * invariant holds because `confirmPaymentAndBooking` (webhook-service.ts)
 * only ever moves a booking out of `pending` in the same transaction its
 * payment becomes `succeeded`, so "still pending" here is proof the payment
 * has not succeeded.
 */
export async function expirePendingBooking(paymentId: string): Promise<ExpireOutcome> {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return null;
    if (payment.status !== "requires_payment" && payment.status !== "processing") {
      // Already settled (paid/failed/cancelled/refunded) by something else
      // since the sweep listed this row — nothing to expire.
      return null;
    }

    const flipped = await tx.$queryRaw<
      { id: string; availability_id: string; participant_count: number }[]
    >`
      UPDATE bookings SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE id = ${payment.bookingId} AND workspace_id = ${payment.workspaceId} AND status = 'pending'
      RETURNING id, availability_id, participant_count
    `;
    if (flipped.length === 0) {
      // Lost the race to a webhook that just confirmed this booking, or it
      // was already cancelled by an operator — safe no-op either way.
      return null;
    }
    const booking = flipped[0];

    await tx.$executeRaw`
      UPDATE availabilities
      SET booked_count = GREATEST(booked_count - ${booking.participant_count}, 0), updated_at = now()
      WHERE id = ${booking.availability_id} AND workspace_id = ${payment.workspaceId}
    `;

    await tx.bookingStatusEvent.create({
      data: {
        workspaceId: payment.workspaceId,
        bookingId: booking.id,
        fromStatus: "pending",
        toStatus: "cancelled",
        actorUserId: null,
        note: "Payment window expired",
      },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "cancelled", failureMessage: "Payment window expired" },
    });

    return { workspaceId: payment.workspaceId, bookingId: booking.id, paymentId: payment.id };
  });

  if (!result) return null;

  await recordAuditEvent({
    action: "payment_expired",
    workspaceId: result.workspaceId,
    userId: null,
    entityType: "booking",
    entityId: result.bookingId,
    metadata: { paymentId: result.paymentId, reason: "payment_window_expired" },
  });

  return { expired: true, ...result };
}

/** All payments still awaiting money whose window has already passed, across every workspace. */
export async function findExpiredPendingPaymentIds(now: Date = new Date()): Promise<string[]> {
  const rows = await prisma.payment.findMany({
    where: {
      status: { in: ["requires_payment", "processing"] },
      expiresAt: { lt: now },
      booking: { status: "pending" },
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * The body of `POST /api/admin/payments/expire-pending` — also callable
 * directly from a test or a future scheduler. Each candidate is processed
 * in its own transaction (via `expirePendingBooking`) so one booking's
 * outcome can never roll back another's.
 */
export async function sweepExpiredPendingBookings(): Promise<{ scanned: number; expired: number }> {
  const ids = await findExpiredPendingPaymentIds();
  let expired = 0;
  for (const id of ids) {
    const outcome = await expirePendingBooking(id);
    if (outcome?.expired) expired += 1;
  }
  return { scanned: ids.length, expired };
}
