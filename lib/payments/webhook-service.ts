import type { Prisma, Payment } from "@prisma/client";
import type Stripe from "stripe";
import { prisma, type Db } from "@/lib/db";
import { recordAuditEvent, type AuditAction } from "@/lib/audit/audit-log";
import { uniqueViolationTargets } from "@/lib/prisma-errors";
import { transitionBookingStatusInTx } from "@/lib/bookings/status-service";

export function isProviderEventUniqueViolation(error: unknown): boolean {
  return uniqueViolationTargets(error).some((target) => /provider_event/i.test(target));
}

type WebhookOutcome = {
  workspaceId: string;
  bookingId: string;
  paymentId: string;
  auditAction: AuditAction;
};

export type ProcessWebhookResult = {
  /** True when this exact Stripe event id was already processed — a safe no-op, not an error. */
  duplicate: boolean;
  outcome: WebhookOutcome | null;
};

async function findPaymentByCheckoutSessionId(tx: Db, sessionId: string): Promise<Payment | null> {
  return tx.payment.findFirst({ where: { providerCheckoutSessionId: sessionId } });
}

async function findPaymentByPaymentIntentId(tx: Db, paymentIntentId: string): Promise<Payment | null> {
  return tx.payment.findFirst({ where: { providerPaymentIntentId: paymentIntentId } });
}

/**
 * Marks the payment succeeded and moves its booking pending -> confirmed in
 * the SAME transaction. This is the load-bearing correctness property for
 * the whole payment layer: the database can never contain
 * `payment.status = "succeeded"` while `booking.status` is still `"pending"`
 * — see docs/17_PHASE_4_IMPLEMENTATION_PLAN.md §8-9 for why the expiration
 * sweep depends on that invariant holding.
 *
 * Guarded on `payment.status !== "succeeded"` so that two different Stripe
 * event types confirming the same payment (checkout.session.completed and
 * payment_intent.succeeded both fire for a synchronous card payment, each
 * with a distinct event.id so the PaymentEvent uniqueness alone doesn't
 * dedupe between them) settles the Payment row once; the booking transition
 * itself is separately idempotent via `transitionBookingStatusInTx`'s
 * `alreadyInStatus` short-circuit either way.
 */
async function confirmPaymentAndBooking(
  tx: Db,
  payment: Payment,
  info: { paymentIntentId?: string | null; paymentMethod?: string | null },
): Promise<WebhookOutcome> {
  if (payment.status !== "succeeded") {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "succeeded",
        providerPaymentIntentId: info.paymentIntentId ?? payment.providerPaymentIntentId,
        paymentMethod: info.paymentMethod ?? payment.paymentMethod,
      },
    });
  }

  await transitionBookingStatusInTx(tx, {
    workspaceId: payment.workspaceId,
    bookingId: payment.bookingId,
    toStatus: "confirmed",
    actor: { kind: "system" },
    note: "Payment succeeded",
  });

  return {
    workspaceId: payment.workspaceId,
    bookingId: payment.bookingId,
    paymentId: payment.id,
    auditAction: "payment_succeeded",
  };
}

async function markPaymentProcessing(tx: Db, payment: Payment): Promise<void> {
  if (payment.status === "succeeded") return;
  await tx.payment.update({ where: { id: payment.id }, data: { status: "processing" } });
}

async function markPaymentFailed(
  tx: Db,
  payment: Payment,
  failure: { code?: string | null; message?: string | null },
): Promise<void> {
  // Never downgrade a payment that already settled successfully — Stripe's
  // at-least-once delivery means a stale `payment_failed` for an earlier
  // attempt on the same PaymentIntent could theoretically arrive after a
  // later success; the booking has already been confirmed by that point and
  // must stay that way. Booking status is deliberately left untouched here
  // either way — a failed/declined attempt does not cancel the booking or
  // release its seats; the guest can still retry within the payment window.
  if (payment.status === "succeeded") return;
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "failed", failureCode: failure.code ?? null, failureMessage: failure.message ?? null },
  });
}

async function markPaymentCancelled(tx: Db, payment: Payment): Promise<void> {
  if (payment.status === "succeeded") return;
  await tx.payment.update({ where: { id: payment.id }, data: { status: "cancelled" } });
}

async function markPaymentRefunded(tx: Db, payment: Payment, charge: Stripe.Charge): Promise<void> {
  const refundedAmount = charge.amount_refunded ?? 0;
  const isFullRefund = refundedAmount >= payment.amount;
  // Deliberately does not touch booking status — an operator decides
  // separately whether a refunded booking should also be cancelled.
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: isFullRefund ? "refunded" : "partially_refunded", refundedAmount },
  });
}

async function dispatch(tx: Db, event: Stripe.Event): Promise<WebhookOutcome | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await findPaymentByCheckoutSessionId(tx, session.id);
      if (!payment) return null;
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
      const paymentMethod = session.payment_method_types?.[0] ?? null;
      if (session.payment_status === "paid") {
        return confirmPaymentAndBooking(tx, payment, { paymentIntentId, paymentMethod });
      }
      await markPaymentProcessing(tx, payment);
      return { workspaceId: payment.workspaceId, bookingId: payment.bookingId, paymentId: payment.id, auditAction: "payment_created" };
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await findPaymentByPaymentIntentId(tx, pi.id);
      if (!payment) return null;
      return confirmPaymentAndBooking(tx, payment, {
        paymentIntentId: pi.id,
        paymentMethod: pi.payment_method_types?.[0] ?? null,
      });
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await findPaymentByPaymentIntentId(tx, pi.id);
      if (!payment) return null;
      await markPaymentFailed(tx, payment, {
        code: pi.last_payment_error?.code ?? null,
        message: pi.last_payment_error?.message ?? null,
      });
      return { workspaceId: payment.workspaceId, bookingId: payment.bookingId, paymentId: payment.id, auditAction: "payment_failed" };
    }
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await findPaymentByPaymentIntentId(tx, pi.id);
      if (!payment) return null;
      await markPaymentCancelled(tx, payment);
      return { workspaceId: payment.workspaceId, bookingId: payment.bookingId, paymentId: payment.id, auditAction: "payment_failed" };
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null);
      if (!paymentIntentId) return null;
      const payment = await findPaymentByPaymentIntentId(tx, paymentIntentId);
      if (!payment) return null;
      await markPaymentRefunded(tx, payment, charge);
      return { workspaceId: payment.workspaceId, bookingId: payment.bookingId, paymentId: payment.id, auditAction: "payment_refunded" };
    }
    default:
      // Every other event type Stripe might deliver (this webhook endpoint
      // isn't narrowed to a subset in the Stripe dashboard) is recorded via
      // the PaymentEvent row already inserted by the caller and otherwise
      // ignored — Stripe expects a 2xx for any event type, recognized or not.
      return null;
  }
}

/**
 * Processes one verified Stripe event. Idempotency and processing happen in
 * ONE transaction: the `PaymentEvent` row (unique on `providerEventId`) is
 * inserted first, so a redelivery of the same event hits the unique
 * constraint and rolls back before any side effect is attempted — the exact
 * same "prove exactly-once via a DB constraint" pattern Phase 3 uses for
 * booking idempotency keys, not an in-memory check.
 */
export async function processStripeWebhookEvent(event: Stripe.Event): Promise<ProcessWebhookResult> {
  let outcome: WebhookOutcome | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const paymentEvent = await tx.paymentEvent.create({
        data: {
          providerEventId: event.id,
          provider: "stripe",
          eventType: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });

      outcome = await dispatch(tx, event);

      await tx.paymentEvent.update({
        where: { id: paymentEvent.id },
        data: {
          workspaceId: outcome?.workspaceId ?? null,
          paymentId: outcome?.paymentId ?? null,
          bookingId: outcome?.bookingId ?? null,
          processedAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (isProviderEventUniqueViolation(error)) {
      return { duplicate: true, outcome: null };
    }
    throw error;
  }

  if (outcome) {
    const settled: WebhookOutcome = outcome;
    await recordAuditEvent({
      action: settled.auditAction,
      workspaceId: settled.workspaceId,
      userId: null,
      entityType: "payment",
      entityId: settled.paymentId,
      metadata: { bookingId: settled.bookingId, eventType: event.type, providerEventId: event.id },
    });
  }

  return { duplicate: false, outcome };
}
