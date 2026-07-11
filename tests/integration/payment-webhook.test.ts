import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBooking } from "@/lib/bookings/service";
import { processStripeWebhookEvent } from "@/lib/payments/webhook-service";
import { getStripeClient } from "@/lib/payments/stripe-client";
import { POST as webhookRoute } from "@/app/api/stripe/webhook/route";
import { createBookableFixture, fakeStripeEvent, prisma } from "./helpers";

/**
 * No mocking in this file — `getStripeClient()` constructs a real `Stripe`
 * instance from `.env.test`'s fake key, which is safe: everything exercised
 * here (constructing/verifying a webhook signature, parsing an event) is
 * pure local HMAC/JSON work with no network call. `processStripeWebhookEvent`
 * itself never touches the Stripe API either — it only processes an
 * already-parsed `Stripe.Event`, which these tests build by hand for the
 * cases below the HTTP layer, and sign for real for the HTTP-layer cases.
 */

function checkoutSessionCompletedEvent(sessionId: string, paymentIntentId: string, paymentStatus: "paid" | "unpaid" = "paid") {
  return fakeStripeEvent("checkout.session.completed", {
    id: sessionId,
    object: "checkout.session",
    payment_intent: paymentIntentId,
    payment_status: paymentStatus,
    payment_method_types: ["card"],
  });
}

function paymentIntentSucceededEvent(paymentIntentId: string) {
  return fakeStripeEvent("payment_intent.succeeded", {
    id: paymentIntentId,
    object: "payment_intent",
    payment_method_types: ["card"],
  });
}

function paymentIntentFailedEvent(paymentIntentId: string) {
  return fakeStripeEvent("payment_intent.payment_failed", {
    id: paymentIntentId,
    object: "payment_intent",
    last_payment_error: { code: "card_declined", message: "Your card was declined." },
  });
}

function chargeRefundedEvent(paymentIntentId: string, amount: number, amountRefunded: number) {
  return fakeStripeEvent("charge.refunded", {
    id: `ch_test_${randomUUID().slice(0, 8)}`,
    object: "charge",
    payment_intent: paymentIntentId,
    amount,
    amount_refunded: amountRefunded,
  });
}

async function pendingPaidBooking(overrides: { participantCount?: number; basePrice?: number } = {}) {
  const participantCount = overrides.participantCount ?? 2;
  const { workspace, tour, availability } = await createBookableFixture({
    tour: { basePrice: overrides.basePrice ?? 5000, capacity: 10 },
  });
  const { booking } = await createBooking({
    workspaceId: workspace.id,
    tourId: tour.id,
    availabilityId: availability.id,
    participantCount,
    participants: Array.from({ length: participantCount }, (_, i) => ({ firstName: `G${i}`, lastName: "Guest" })),
    guestFirstName: "G0",
    guestLastName: "Guest",
    guestEmail: `webhook-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct",
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
  });
  expect(booking.status).toBe("pending");

  const sessionId = `cs_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const paymentIntentId = `pi_test_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const payment = await prisma.payment.create({
    data: {
      workspaceId: workspace.id,
      bookingId: booking.id,
      provider: "stripe",
      providerCheckoutSessionId: sessionId,
      providerPaymentIntentId: paymentIntentId,
      amount: booking.totalAmount,
      currency: booking.currency,
      status: "requires_payment",
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  return { workspace, tour, availability, booking, payment, sessionId, paymentIntentId };
}

describe("processStripeWebhookEvent — payment success confirms the booking atomically", () => {
  it("checkout.session.completed (paid) marks the payment succeeded and confirms the booking together", async () => {
    const { workspace, booking, payment, sessionId, paymentIntentId } = await pendingPaidBooking();

    const result = await processStripeWebhookEvent(checkoutSessionCompletedEvent(sessionId, paymentIntentId));
    expect(result.duplicate).toBe(false);
    expect(result.outcome?.auditAction).toBe("payment_succeeded");

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("confirmed");
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("succeeded");

    const auditEvents = await prisma.auditLog.findMany({
      where: { workspaceId: workspace.id, action: "payment_succeeded" },
    });
    expect(auditEvents).toHaveLength(1);
  });

  it("redelivering the identical event is idempotent — no double confirm, no duplicate PaymentEvent", async () => {
    const { booking, payment, workspace, sessionId, paymentIntentId } = await pendingPaidBooking();
    const event = checkoutSessionCompletedEvent(sessionId, paymentIntentId);

    const first = await processStripeWebhookEvent(event);
    expect(first.duplicate).toBe(false);
    const second = await processStripeWebhookEvent(event); // identical event.id
    expect(second.duplicate).toBe(true);

    const paymentEvents = await prisma.paymentEvent.count({ where: { paymentId: payment.id } });
    expect(paymentEvents).toBe(1);
    const auditEvents = await prisma.auditLog.count({
      where: { workspaceId: workspace.id, action: "payment_succeeded" },
    });
    expect(auditEvents).toBe(1);
    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("confirmed");
  });

  it("checkout.session.completed then payment_intent.succeeded (two distinct events for one payment) settle it exactly once", async () => {
    const { booking, sessionId, paymentIntentId } = await pendingPaidBooking();

    await processStripeWebhookEvent(checkoutSessionCompletedEvent(sessionId, paymentIntentId));
    const result = await processStripeWebhookEvent(paymentIntentSucceededEvent(paymentIntentId));
    expect(result.duplicate).toBe(false); // a genuinely different event.id, not a redelivery

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("confirmed");
    // One event for creation (pending) + one for confirmation — the second
    // webhook's transition is a no-op (`alreadyInStatus`), not a new row.
    const statusEvents = await prisma.bookingStatusEvent.count({ where: { bookingId: booking.id } });
    expect(statusEvents).toBe(2);
  });

  it("checkout.session.completed with payment_status unpaid marks processing, not succeeded — booking stays pending", async () => {
    const { booking, payment, sessionId, paymentIntentId } = await pendingPaidBooking();

    await processStripeWebhookEvent(checkoutSessionCompletedEvent(sessionId, paymentIntentId, "unpaid"));

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("pending");
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("processing");
  });
});

describe("processStripeWebhookEvent — failure and refund never confirm or auto-cancel", () => {
  it("payment_intent.payment_failed marks the payment failed but leaves the booking pending with capacity still held", async () => {
    const { availability, booking, payment, paymentIntentId } = await pendingPaidBooking({ participantCount: 3 });

    const result = await processStripeWebhookEvent(paymentIntentFailedEvent(paymentIntentId));
    expect(result.outcome?.auditAction).toBe("payment_failed");

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("pending"); // not cancelled — the guest can still retry
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("failed");
    expect(updatedPayment.failureCode).toBe("card_declined");

    const updatedAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updatedAvailability.bookedCount).toBe(3); // seats still held
  });

  it("charge.refunded (full) marks the payment refunded without touching booking status", async () => {
    const { booking, payment, sessionId, paymentIntentId } = await pendingPaidBooking();
    await processStripeWebhookEvent(checkoutSessionCompletedEvent(sessionId, paymentIntentId));

    const result = await processStripeWebhookEvent(chargeRefundedEvent(paymentIntentId, payment.amount, payment.amount));
    expect(result.outcome?.auditAction).toBe("payment_refunded");

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("refunded");
    expect(updatedPayment.refundedAmount).toBe(payment.amount);

    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("confirmed"); // an operator decides separately whether to cancel
  });

  it("a partial refund is recorded as partially_refunded with the exact amount", async () => {
    const { payment, sessionId, paymentIntentId } = await pendingPaidBooking();
    await processStripeWebhookEvent(checkoutSessionCompletedEvent(sessionId, paymentIntentId));

    const partial = Math.floor(payment.amount / 2);
    await processStripeWebhookEvent(chargeRefundedEvent(paymentIntentId, payment.amount, partial));

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe("partially_refunded");
    expect(updatedPayment.refundedAmount).toBe(partial);
  });

  it("an event that matches no known payment is recorded and ignored, not errored", async () => {
    const result = await processStripeWebhookEvent(paymentIntentFailedEvent("pi_does_not_exist"));
    expect(result.duplicate).toBe(false);
    expect(result.outcome).toBeNull();
  });
});

describe("POST /api/stripe/webhook — signature verification", () => {
  it("processes a validly-signed event and rejects an invalid signature with zero side effects", async () => {
    const { booking, sessionId, paymentIntentId } = await pendingPaidBooking();
    const event = checkoutSessionCompletedEvent(sessionId, paymentIntentId);
    const payloadString = JSON.stringify(event);

    const validSignature = getStripeClient().webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
    });

    const ok = await webhookRoute(
      new Request("http://x/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": validSignature },
        body: payloadString,
      }),
    );
    expect(ok.status).toBe(200);
    const updatedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(updatedBooking.status).toBe("confirmed");

    const bad = await webhookRoute(
      new Request("http://x/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
        body: payloadString,
      }),
    );
    expect(bad.status).toBe(400);
    // The rejected attempt made no DB write at all — only the one valid delivery's row exists.
    const events = await prisma.paymentEvent.count({ where: { providerEventId: event.id } });
    expect(events).toBe(1);
  });

  it("rejects a request with no Stripe-Signature header", async () => {
    const res = await webhookRoute(
      new Request("http://x/api/stripe/webhook", { method: "POST", body: JSON.stringify({ id: "evt_x" }) }),
    );
    expect(res.status).toBe(400);
  });
});
