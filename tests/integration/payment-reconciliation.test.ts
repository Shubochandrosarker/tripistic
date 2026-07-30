import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createBooking } from "@/lib/bookings/service";
import { sweepExpiredPendingBookings } from "@/lib/payments/expiration";
import { processStripeWebhookEvent } from "@/lib/payments/webhook-service";
import { createBookableFixture, fakeStripeEvent, prisma } from "./helpers";

/**
 * docs/FINAL-LAUNCH-AUDIT.md §6.5 — money arrives for a booking that is no
 * longer confirmable.
 *
 * The guest's card completes just after the expiry sweep cancelled their
 * booking, or after an operator cancelled it. `confirmPaymentAndBooking`
 * previously called `transitionBookingStatusInTx` unconditionally, which
 * throws `conflict` on `cancelled -> confirmed`. That threw out of the
 * transaction and rolled back *everything*, including the `PaymentEvent` row
 * that makes redelivery idempotent — so Stripe retried the same event forever
 * while the captured payment was recorded nowhere.
 */

const uniqueId = (prefix: string) => `${prefix}_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

function checkoutCompleted(sessionId: string, paymentIntentId: string) {
  return fakeStripeEvent("checkout.session.completed", {
    id: sessionId,
    object: "checkout.session",
    payment_intent: paymentIntentId,
    payment_status: "paid",
    payment_method_types: ["card"],
  });
}

async function bookingInCheckout(expiresAt: Date = new Date(Date.now() + 30 * 60_000)) {
  const fixture = await createBookableFixture({ tour: { basePrice: 5000, capacity: 10 } });
  const { booking } = await createBooking({
    workspaceId: fixture.workspace.id,
    tourId: fixture.tour.id,
    availabilityId: fixture.availability.id,
    participantCount: 2,
    participants: [
      { firstName: "A", lastName: "Guest" },
      { firstName: "B", lastName: "Guest" },
    ],
    guestFirstName: "A",
    guestLastName: "Guest",
    guestEmail: `recon-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct",
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
  });

  const sessionId = uniqueId("cs");
  const paymentIntentId = uniqueId("pi");
  const payment = await prisma.payment.create({
    data: {
      workspaceId: fixture.workspace.id,
      bookingId: booking.id,
      provider: "stripe",
      providerCheckoutSessionId: sessionId,
      providerPaymentIntentId: paymentIntentId,
      amount: booking.totalAmount,
      currency: booking.currency,
      status: "requires_payment",
      expiresAt,
    },
  });

  return { ...fixture, booking, payment, sessionId, paymentIntentId };
}

describe("payment succeeds after the booking was cancelled", () => {
  it("keeps the money recorded, flags reconciliation, and does not throw at Stripe", async () => {
    const { workspace, booking, payment, sessionId, paymentIntentId } = await bookingInCheckout();

    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    const result = await processStripeWebhookEvent(checkoutCompleted(sessionId, paymentIntentId));

    expect(result.duplicate).toBe(false);
    expect(result.outcome?.auditAction).toBe("payment_requires_reconciliation");

    // The payment status update is the part that MUST survive: Stripe has the
    // customer's money either way, and a record that says otherwise is worse
    // than useless.
    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(settled.status).toBe("succeeded");
    expect(settled.failureCode).toBe("paid_after_cancellation");
    expect(settled.failureMessage).toMatch(/refund or manual reconciliation/i);

    // Not silently resurrected — the seats may already belong to someone else.
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("cancelled");

    // Visible where an operator already looks.
    const events = await prisma.bookingStatusEvent.findMany({ where: { bookingId: booking.id } });
    expect(events.some((e) => e.note?.includes("refund required"))).toBe(true);

    const audit = await prisma.auditLog.findMany({
      where: { workspaceId: workspace.id, action: "payment_requires_reconciliation" },
    });
    expect(audit).toHaveLength(1);
  });

  it("writes the idempotency row, so a redelivery is not reprocessed", async () => {
    const { booking, payment, sessionId, paymentIntentId } = await bookingInCheckout();
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    const event = checkoutCompleted(sessionId, paymentIntentId);
    const first = await processStripeWebhookEvent(event);
    expect(first.duplicate).toBe(false);

    // Before the fix the whole transaction rolled back, so this second call
    // saw no PaymentEvent and reprocessed — Stripe's retries never converged.
    const second = await processStripeWebhookEvent(event);
    expect(second.duplicate).toBe(true);

    expect(await prisma.paymentEvent.count({ where: { paymentId: payment.id } })).toBe(1);
    const statusEvents = await prisma.bookingStatusEvent.count({
      where: { bookingId: booking.id, note: { contains: "refund required" } },
    });
    expect(statusEvents).toBe(1);
  });

  it("handles the real sweep-then-pay race end to end", async () => {
    // The exact production sequence: the window closes, the sweep cancels the
    // booking and releases the seats, and only then does Stripe report the
    // charge as complete.
    const { booking, availability, payment, sessionId, paymentIntentId } = await bookingInCheckout(
      new Date(Date.now() - 60 * 60_000),
    );

    await sweepExpiredPendingBookings();

    const swept = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(swept.status).toBe("cancelled");
    const released = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(released.bookedCount).toBe(0);

    const result = await processStripeWebhookEvent(checkoutCompleted(sessionId, paymentIntentId));
    expect(result.outcome?.auditAction).toBe("payment_requires_reconciliation");

    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(settled.status).toBe("succeeded");
    expect(settled.failureCode).toBe("paid_after_cancellation");

    // Capacity is NOT re-consumed: those seats may have been resold, and
    // quietly overbooking a departure is worse than owing one refund.
    const stillReleased = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(stillReleased.bookedCount).toBe(0);
  });

  it("does not flag reconciliation for Stripe's second event on a healthy payment", async () => {
    // Stripe sends both `checkout.session.completed` and
    // `payment_intent.succeeded` for one successful checkout. The second
    // arrives with the booking already `confirmed`, which the state machine
    // will not re-transition — but that is the single most common event
    // sequence in production, not a discrepancy. Routing it into the
    // reconciliation branch would tell operators to refund healthy bookings.
    const { booking, payment, sessionId, paymentIntentId } = await bookingInCheckout();

    const first = await processStripeWebhookEvent(checkoutCompleted(sessionId, paymentIntentId));
    expect(first.outcome?.auditAction).toBe("payment_succeeded");

    const second = await processStripeWebhookEvent(
      fakeStripeEvent("payment_intent.succeeded", {
        id: paymentIntentId,
        object: "payment_intent",
        payment_method_types: ["card"],
      }),
    );
    expect(second.duplicate).toBe(false); // a genuinely different event.id
    expect(second.outcome?.auditAction).toBe("payment_succeeded");

    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(settled.failureCode).toBeNull();

    const noise = await prisma.bookingStatusEvent.count({
      where: { bookingId: booking.id, note: { contains: "refund required" } },
    });
    expect(noise).toBe(0);
  });

  it("still confirms normally when the booking is untouched", async () => {
    // The reconciliation branch must not swallow the ordinary success path.
    const { booking, payment, sessionId, paymentIntentId } = await bookingInCheckout();

    const result = await processStripeWebhookEvent(checkoutCompleted(sessionId, paymentIntentId));
    expect(result.outcome?.auditAction).toBe("payment_succeeded");

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("confirmed");
    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(settled.status).toBe("succeeded");
    expect(settled.failureCode).toBeNull();
  });
});
