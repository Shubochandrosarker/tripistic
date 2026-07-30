import type { Prisma, Payment } from "@prisma/client";
import type Stripe from "stripe";
import { prisma, type Db } from "@/lib/db";
import { recordAuditEvent, type AuditAction } from "@/lib/audit/audit-log";
import { uniqueViolationTargets } from "@/lib/prisma-errors";
import { transitionBookingStatusInTx } from "@/lib/bookings/status-service";
import { canTransition } from "@/lib/bookings/status";
import { sendBookingConfirmationEmail } from "@/lib/messaging/service";
import { upsertWorkspacePaymentAccountFromStripe } from "@/lib/payments/connect";
import { fromStripeAmount } from "@/lib/payments/stripe-client";

export function isProviderEventUniqueViolation(error: unknown): boolean {
  return uniqueViolationTargets(error).some((target) => /provider_event/i.test(target));
}

type WebhookOutcome = {
  workspaceId: string;
  bookingId: string | null;
  paymentId: string | null;
  auditAction: AuditAction;
  entityType?: string;
  entityId?: string;
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

async function findPaymentByChargeId(tx: Db, chargeId: string): Promise<Payment | null> {
  return tx.payment.findFirst({ where: { providerChargeId: chargeId } });
}

function idFromStripeRef(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

function unixDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
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
  info: {
    paymentIntentId?: string | null;
    paymentMethod?: string | null;
    connectedAccountId?: string | null;
    chargeId?: string | null;
  },
): Promise<WebhookOutcome> {
  if (payment.status !== "succeeded") {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "succeeded",
        providerPaymentIntentId: info.paymentIntentId ?? payment.providerPaymentIntentId,
        providerChargeId: info.chargeId ?? payment.providerChargeId,
        providerConnectedAccountId: info.connectedAccountId ?? payment.providerConnectedAccountId,
        paymentMethod: info.paymentMethod ?? payment.paymentMethod,
      },
    });
  }

  // Money has arrived for a booking that may no longer be confirmable — the
  // expiry sweep or an operator may have cancelled it while the guest was in
  // checkout. Previously this called transitionBookingStatusInTx
  // unconditionally, which threw `conflict` from cancelled -> confirmed and
  // rolled back the WHOLE transaction *including the PaymentEvent
  // idempotency row*. Stripe then retried, hit the identical failure, and
  // looped indefinitely: money captured, seat released to someone else, no
  // reconciliation record, and a webhook failing forever.
  //
  // The payment status update above is what must survive. Whether the booking
  // can follow is a separate question, and a "no" is a reconciliation case,
  // not an error to throw at Stripe.
  const booking = await tx.booking.findUnique({
    where: { id: payment.bookingId },
    select: { status: true },
  });

  // Stripe sends two distinct events for one successful checkout —
  // `checkout.session.completed` and `payment_intent.succeeded` — and both
  // reach here. The second arrives with the booking already `confirmed`, which
  // is not a transition the state machine allows (nothing may go
  // `confirmed -> confirmed`) but is emphatically not a discrepancy either.
  // Treating "already in the target status" as anything other than success
  // would stamp `paid_after_cancellation` on the most ordinary payment there
  // is and tell an operator to refund a booking that is perfectly fine.
  const alreadyConfirmed = booking?.status === "confirmed";
  const confirmable = booking ? canTransition(booking.status, "confirmed") : false;

  if (alreadyConfirmed) {
    return {
      workspaceId: payment.workspaceId,
      bookingId: payment.bookingId,
      paymentId: payment.id,
      auditAction: "payment_succeeded",
    };
  }

  if (confirmable) {
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

  // Record the discrepancy against the booking's own history so an operator
  // sees it where they already look, and flag the payment for review. The
  // seats are NOT reclaimed: they may already belong to another guest, and
  // silently double-booking a departure would be worse than holding a refund.
  await tx.bookingStatusEvent.create({
    data: {
      workspaceId: payment.workspaceId,
      bookingId: payment.bookingId,
      fromStatus: booking?.status ?? "cancelled",
      toStatus: booking?.status ?? "cancelled",
      actorUserId: null,
      note: `Payment succeeded after the booking was ${booking?.status ?? "removed"} — refund required`,
    },
  });

  await tx.payment.update({
    where: { id: payment.id },
    data: {
      failureCode: "paid_after_cancellation",
      failureMessage: `Payment captured after the booking became ${booking?.status ?? "unavailable"}. Needs refund or manual reconciliation.`,
    },
  });

  return {
    workspaceId: payment.workspaceId,
    bookingId: payment.bookingId,
    paymentId: payment.id,
    // A distinct action so this is searchable in the audit log rather than
    // buried among ordinary successes.
    auditAction: "payment_requires_reconciliation",
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
  const balanceTransactionId =
    typeof charge.balance_transaction === "string" ? charge.balance_transaction : (charge.balance_transaction?.id ?? null);
  const transferId = typeof charge.transfer === "string" ? charge.transfer : (charge.transfer?.id ?? null);
  // Deliberately does not touch booking status — an operator decides
  // separately whether a refunded booking should also be cancelled.
  await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: isFullRefund ? "refunded" : "partially_refunded",
      refundedAmount,
      providerChargeId: charge.id,
      providerBalanceTxnId: balanceTransactionId,
      providerTransferId: transferId,
      receiptUrl: charge.receipt_url ?? payment.receiptUrl,
    },
  });
}

async function syncPaymentAccountFromWebhook(tx: Db, account: Stripe.Account): Promise<WebhookOutcome | null> {
  const existing = await tx.workspacePaymentAccount.findUnique({
    where: { providerAccountId: account.id },
    select: { workspaceId: true },
  });
  const workspaceId = account.metadata?.workspaceId ?? existing?.workspaceId ?? null;
  if (!workspaceId) return null;

  const paymentAccount = await upsertWorkspacePaymentAccountFromStripe(tx, workspaceId, account);
  return {
    workspaceId,
    bookingId: null,
    paymentId: null,
    auditAction: "payment_account_synced",
    entityType: "workspace_payment_account",
    entityId: paymentAccount.id,
  };
}

async function syncDisputeFromWebhook(tx: Db, dispute: Stripe.Dispute, event: Stripe.Event): Promise<WebhookOutcome | null> {
  const raw = dispute as unknown as {
    charge?: string | { id?: string } | null;
    payment_intent?: string | { id?: string } | null;
    evidence_details?: { due_by?: number | null };
  };
  const chargeId = idFromStripeRef(raw.charge);
  const paymentIntentId = idFromStripeRef(raw.payment_intent);
  const payment =
    (chargeId ? await findPaymentByChargeId(tx, chargeId) : null) ??
    (paymentIntentId ? await findPaymentByPaymentIntentId(tx, paymentIntentId) : null);

  const paymentAccount = event.account
    ? await tx.workspacePaymentAccount.findUnique({
        where: { providerAccountId: event.account },
        select: { workspaceId: true },
      })
    : null;
  const workspaceId = payment?.workspaceId ?? paymentAccount?.workspaceId ?? dispute.metadata?.workspaceId ?? null;
  if (!workspaceId) return null;

  const disputeRow = await tx.paymentDispute.upsert({
    where: { providerDisputeId: dispute.id },
    create: {
      workspaceId,
      paymentId: payment?.id ?? null,
      provider: "stripe",
      providerDisputeId: dispute.id,
      providerChargeId: chargeId,
      amount: fromStripeAmount(dispute.amount, dispute.currency),
      currency: dispute.currency.toUpperCase(),
      status: dispute.status,
      reason: dispute.reason ?? null,
      evidenceDueBy: unixDate(raw.evidence_details?.due_by),
      createdAtStripe: unixDate(dispute.created),
      closedAt: dispute.status === "lost" || dispute.status === "won" ? new Date() : null,
      metadata: { providerAccountId: event.account ?? null },
    },
    update: {
      paymentId: payment?.id ?? undefined,
      providerChargeId: chargeId,
      amount: fromStripeAmount(dispute.amount, dispute.currency),
      currency: dispute.currency.toUpperCase(),
      status: dispute.status,
      reason: dispute.reason ?? null,
      evidenceDueBy: unixDate(raw.evidence_details?.due_by),
      closedAt: dispute.status === "lost" || dispute.status === "won" ? new Date() : null,
      metadata: { providerAccountId: event.account ?? null },
    },
  });

  return {
    workspaceId,
    bookingId: payment?.bookingId ?? null,
    paymentId: payment?.id ?? null,
    auditAction: "payment_dispute_updated",
    entityType: "payment_dispute",
    entityId: disputeRow.id,
  };
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
        return confirmPaymentAndBooking(tx, payment, {
          paymentIntentId,
          paymentMethod,
          connectedAccountId: event.account ?? payment.providerConnectedAccountId,
          chargeId: idFromStripeRef(session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent.latest_charge : null),
        });
      }
      await markPaymentProcessing(tx, payment);
      return { workspaceId: payment.workspaceId, bookingId: payment.bookingId, paymentId: payment.id, auditAction: "payment_created" };
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const payment = await findPaymentByPaymentIntentId(tx, pi.id);
      if (!payment) return null;
      const transferDestination =
        typeof pi.transfer_data?.destination === "string"
          ? pi.transfer_data.destination
          : (pi.transfer_data?.destination?.id ?? null);
      return confirmPaymentAndBooking(tx, payment, {
        paymentIntentId: pi.id,
        paymentMethod: pi.payment_method_types?.[0] ?? null,
        connectedAccountId: event.account ?? transferDestination ?? payment.providerConnectedAccountId,
        chargeId: idFromStripeRef(pi.latest_charge),
      });
    }
    case "charge.succeeded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = idFromStripeRef(charge.payment_intent);
      if (!paymentIntentId) return null;
      const payment = await findPaymentByPaymentIntentId(tx, paymentIntentId);
      if (!payment) return null;
      const balanceTransactionId = idFromStripeRef(charge.balance_transaction);
      const transferId = idFromStripeRef((charge as unknown as { transfer?: unknown }).transfer);
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          providerChargeId: charge.id,
          providerBalanceTxnId: balanceTransactionId,
          providerTransferId: transferId,
          receiptUrl: charge.receipt_url ?? payment.receiptUrl,
          providerConnectedAccountId: event.account ?? payment.providerConnectedAccountId,
        },
      });
      return { workspaceId: payment.workspaceId, bookingId: payment.bookingId, paymentId: payment.id, auditAction: "payment_reconciled" };
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
    case "account.updated": {
      return syncPaymentAccountFromWebhook(tx, event.data.object as Stripe.Account);
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      return syncDisputeFromWebhook(tx, event.data.object as Stripe.Dispute, event);
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
          providerAccountId: event.account ?? null,
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
      entityType: settled.entityType ?? "payment",
      entityId: settled.entityId ?? settled.paymentId ?? undefined,
      metadata: { bookingId: settled.bookingId, eventType: event.type, providerEventId: event.id },
    });

    // Phase 5: the main paid-booking path — a verified webhook confirming
    // payment is one of the three places a booking becomes `confirmed`
    // (see docs/19_PHASE_5_IMPLEMENTATION_PLAN.md §5). Sent after this
    // transaction has committed, same as the audit event above.
    if (settled.auditAction === "payment_succeeded" && settled.bookingId) {
      await sendBookingConfirmationEmail(settled.bookingId);
    }
  }

  return { duplicate: false, outcome };
}
