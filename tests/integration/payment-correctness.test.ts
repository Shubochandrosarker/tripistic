import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  findExpiredPendingPaymentIds,
  sweepExpiredPendingBookings,
} from "@/lib/payments/expiration";
import { createBooking } from "@/lib/bookings/service";
import { createBookableFixture, prisma } from "./helpers";

/**
 * Phase 3 regressions: the inventory and reconciliation defects recorded in
 * docs/FINAL-LAUNCH-AUDIT.md §6.
 */

const PAST = () => new Date(Date.now() - 60 * 60 * 1000);
const FUTURE = () => new Date(Date.now() + 60 * 60 * 1000);

async function pendingPaidBooking(basePrice = 5000) {
  const fixture = await createBookableFixture({
    tour: { basePrice, capacity: 5 },
    paymentAccount: true,
  });
  const { booking } = await createBooking({
    workspaceId: fixture.workspace.id,
    tourId: fixture.tour.id,
    availabilityId: fixture.availability.id,
    participantCount: 2,
    participants: [
      { firstName: "A", lastName: "B" },
      { firstName: "C", lastName: "D" },
    ],
    guestFirstName: "A",
    guestLastName: "B",
    guestEmail: `pay-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct",
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
  });
  return { ...fixture, booking };
}

function paymentData(booking: { id: string; workspaceId: string; totalAmount: number }, over: Record<string, unknown>) {
  return {
    workspaceId: booking.workspaceId,
    bookingId: booking.id,
    provider: "stripe",
    amount: booking.totalAmount,
    currency: "USD",
    ...over,
  } as never;
}

async function seatsTaken(availabilityId: string) {
  const row = await prisma.availability.findUniqueOrThrow({ where: { id: availabilityId } });
  return row.bookedCount;
}

describe("§6.1 — a declined payment must not hold seats forever", () => {
  it("includes an expired failed payment in the sweep and releases its seats", async () => {
    const { booking, availability } = await pendingPaidBooking();
    expect(await seatsTaken(availability.id)).toBe(2);

    // The guest's card was declined; markPaymentFailed leaves the booking
    // pending so they can retry, and the window has since closed.
    await prisma.payment.create({
      data: paymentData(booking, { status: "failed", expiresAt: PAST() }),
    });

    const swept = await sweepExpiredPendingBookings();
    expect(swept.expired).toBeGreaterThan(0);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("cancelled");
    // Previously `failed` was excluded from the sweep, so these two seats
    // were held permanently with no code path able to free them.
    expect(await seatsTaken(availability.id)).toBe(0);
  });
});

describe("§6.4 — a stale attempt must not cancel a live retry", () => {
  it("does not list a booking whose newest attempt is still live", async () => {
    const { booking } = await pendingPaidBooking();

    // First attempt was abandoned and its window has closed...
    await prisma.payment.create({
      data: paymentData(booking, { status: "requires_payment", expiresAt: PAST() }),
    });
    // ...but the guest retried and is mid-checkout on a live session.
    await prisma.payment.create({
      data: paymentData(booking, { status: "requires_payment", expiresAt: FUTURE() }),
    });

    const ids = await findExpiredPendingPaymentIds();
    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      select: { id: true },
    });
    const ours = new Set(payments.map((p) => p.id));

    // Cancelling here would kill a booking whose guest is actively paying.
    expect([...ids].some((id) => ours.has(id))).toBe(false);
  });

  it("still expires the booking once every attempt has lapsed", async () => {
    const { booking, availability } = await pendingPaidBooking();
    await prisma.payment.create({
      data: paymentData(booking, { status: "failed", expiresAt: PAST() }),
    });
    await prisma.payment.create({
      data: paymentData(booking, { status: "requires_payment", expiresAt: PAST() }),
    });

    await sweepExpiredPendingBookings();

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("cancelled");
    expect(await seatsTaken(availability.id)).toBe(0);
  });

  it("selects at most one candidate per booking", async () => {
    const { booking } = await pendingPaidBooking();
    for (let i = 0; i < 3; i += 1) {
      await prisma.payment.create({
        data: paymentData(booking, { status: "failed", expiresAt: PAST() }),
      });
    }

    const ids = await findExpiredPendingPaymentIds();
    const ourPayments = await prisma.payment.findMany({
      where: { bookingId: booking.id },
      select: { id: true },
    });
    const ours = ourPayments.filter((p) => ids.includes(p.id));
    // Three stale attempts, one booking, one cancellation candidate.
    expect(ours).toHaveLength(1);
  });
});

describe("sweep safety", () => {
  it("never touches a confirmed booking", async () => {
    const { booking, availability } = await pendingPaidBooking();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
    await prisma.payment.create({
      data: paymentData(booking, { status: "requires_payment", expiresAt: PAST() }),
    });

    await sweepExpiredPendingBookings();

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    // A paid booking must survive a late sweep; its seats stay held.
    expect(after.status).toBe("confirmed");
    expect(await seatsTaken(availability.id)).toBe(2);
  });

  it("is idempotent — a second sweep releases nothing further", async () => {
    const { booking, availability } = await pendingPaidBooking();
    await prisma.payment.create({
      data: paymentData(booking, { status: "requires_payment", expiresAt: PAST() }),
    });

    await sweepExpiredPendingBookings();
    const afterFirst = await seatsTaken(availability.id);
    await sweepExpiredPendingBookings();

    // Releasing twice would drive booked_count below the real figure and
    // oversell the departure.
    expect(await seatsTaken(availability.id)).toBe(afterFirst);
  });
});
