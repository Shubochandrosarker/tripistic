import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBooking } from "@/lib/bookings/service";
import { processStripeWebhookEvent } from "@/lib/payments/webhook-service";
import { expirePendingBooking, findExpiredPendingPaymentIds, sweepExpiredPendingBookings } from "@/lib/payments/expiration";
import { createBookableFixture, fakeStripeEvent, prisma } from "./helpers";

async function pendingBookingWithPayment(overrides: { participantCount?: number; expired?: boolean } = {}) {
  const participantCount = overrides.participantCount ?? 2;
  const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 4000, capacity: 10 } });
  const { booking } = await createBooking({
    workspaceId: workspace.id,
    tourId: tour.id,
    availabilityId: availability.id,
    participantCount,
    participants: Array.from({ length: participantCount }, (_, i) => ({ firstName: `E${i}`, lastName: "Guest" })),
    guestFirstName: "E0",
    guestLastName: "Guest",
    guestEmail: `expire-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct",
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
  });
  expect(booking.status).toBe("pending");

  const expiresAt = overrides.expired === false ? new Date(Date.now() + 30 * 60_000) : new Date(Date.now() - 60_000);
  const payment = await prisma.payment.create({
    data: {
      workspaceId: workspace.id,
      bookingId: booking.id,
      provider: "stripe",
      providerCheckoutSessionId: `cs_test_${randomUUID().slice(0, 12)}`,
      providerPaymentIntentId: `pi_test_${randomUUID().slice(0, 12)}`,
      amount: booking.totalAmount,
      currency: booking.currency,
      status: "requires_payment",
      expiresAt,
    },
  });
  return { workspace, tour, availability, booking, payment };
}

describe("expirePendingBooking", () => {
  it("cancels an expired unpaid booking and releases capacity exactly once", async () => {
    const { workspace, availability, booking, payment } = await pendingBookingWithPayment({ participantCount: 3 });

    const outcome = await expirePendingBooking(payment.id);
    expect(outcome?.expired).toBe(true);

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("cancelled");
    const updatedAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updatedAvailability.bookedCount).toBe(0);
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("cancelled");
    expect(updatedPayment.failureMessage).toBe("Payment window expired");

    const auditEvents = await prisma.auditLog.count({
      where: { workspaceId: workspace.id, action: "payment_expired" },
    });
    expect(auditEvents).toBe(1);

    // Calling it again is a safe no-op, not a double release.
    const second = await expirePendingBooking(payment.id);
    expect(second).toBeNull();
    const stillZero = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(stillZero.bookedCount).toBe(0);
  });

  it("does not touch a booking a webhook already confirmed — the expire-vs-webhook race", async () => {
    const { availability, booking, payment } = await pendingBookingWithPayment({ participantCount: 2 });

    // Simulate the webhook winning the race a moment before the sweep runs.
    await processStripeWebhookEvent(
      fakeStripeEvent("payment_intent.succeeded", {
        id: payment.providerPaymentIntentId,
        object: "payment_intent",
        payment_method_types: ["card"],
      }),
    );

    const outcome = await expirePendingBooking(payment.id);
    expect(outcome).toBeNull(); // no-op — the payment already succeeded

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("confirmed"); // still confirmed, not cancelled
    const updatedAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updatedAvailability.bookedCount).toBe(2); // seats were never released
  });

  it("is a no-op for a payment already settled by an earlier webhook", async () => {
    const { booking, availability, payment } = await pendingBookingWithPayment({ participantCount: 1 });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "cancelled" } });

    const outcome = await expirePendingBooking(payment.id);
    expect(outcome).toBeNull();

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("pending");
    const updatedAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updatedAvailability.bookedCount).toBe(1);
  });

  /**
   * This case previously asserted that a `failed` payment is never expired.
   * docs/FINAL-LAUNCH-AUDIT.md §6.1 identifies that as the defect rather than
   * the contract: `markPaymentFailed` leaves the booking `pending` so the
   * guest can retry, so a decline whose window then closed held its seats with
   * no code path able to release them. The expectation is inverted below, and
   * the retry window it was protecting is covered by the case after it.
   */
  it("expires a declined payment once its window has closed", async () => {
    const { booking, availability, payment } = await pendingBookingWithPayment({ participantCount: 1 });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });

    const outcome = await expirePendingBooking(payment.id);
    expect(outcome?.expired).toBe(true);

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("cancelled");
    const updatedAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updatedAvailability.bookedCount).toBe(0);
  });

  it("leaves a declined payment alone while its window is still open", async () => {
    // The guest's card was declined but they can still retry — cancelling
    // here would be worse than the bug the case above fixes. The window is
    // enforced inside `expirePendingBooking` itself, so this holds even for a
    // caller that did not go through `findExpiredPendingPaymentIds`.
    const { booking, availability, payment } = await pendingBookingWithPayment({
      participantCount: 1,
      expired: false,
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });

    const outcome = await expirePendingBooking(payment.id);
    expect(outcome).toBeNull();

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("pending");
    const updatedAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updatedAvailability.bookedCount).toBe(1);
  });
});

describe("sweepExpiredPendingBookings", () => {
  it("expires only the expired, still-pending candidates and leaves the rest untouched", async () => {
    const expired1 = await pendingBookingWithPayment();
    const expired2 = await pendingBookingWithPayment();
    const notExpiredYet = await pendingBookingWithPayment({ expired: false });

    const ids = await findExpiredPendingPaymentIds();
    expect(ids).toEqual(expect.arrayContaining([expired1.payment.id, expired2.payment.id]));
    expect(ids).not.toContain(notExpiredYet.payment.id);

    const result = await sweepExpiredPendingBookings();
    expect(result.expired).toBeGreaterThanOrEqual(2);

    const b1 = await prisma.booking.findUniqueOrThrow({ where: { id: expired1.booking.id } });
    const b2 = await prisma.booking.findUniqueOrThrow({ where: { id: expired2.booking.id } });
    const b3 = await prisma.booking.findUniqueOrThrow({ where: { id: notExpiredYet.booking.id } });
    expect(b1.status).toBe("cancelled");
    expect(b2.status).toBe("cancelled");
    expect(b3.status).toBe("pending");
  });
});
