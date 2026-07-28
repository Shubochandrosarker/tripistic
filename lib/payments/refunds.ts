import { badRequest, conflict, notFound } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getStripeClient, toStripeAmount } from "@/lib/payments/stripe-client";

export type RefundReason = "duplicate" | "fraudulent" | "requested_by_customer";

export function refundableAmount(payment: { amount: number; refundedAmount: number | null }): number {
  return Math.max(0, payment.amount - (payment.refundedAmount ?? 0));
}

export async function createPaymentRefund({
  workspaceId,
  paymentId,
  userId,
  amount,
  reason,
  idempotencyKey,
}: {
  workspaceId: string;
  paymentId: string;
  userId: string;
  amount?: number | null;
  reason: RefundReason;
  idempotencyKey: string;
}) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, workspaceId },
  });
  if (!payment) throw notFound("Payment not found.");
  if (!payment.providerPaymentIntentId) {
    throw conflict("This payment does not have a Stripe PaymentIntent to refund.");
  }
  if (!["succeeded", "partially_refunded"].includes(payment.status)) {
    throw conflict("Only succeeded payments can be refunded.");
  }

  const remaining = refundableAmount(payment);
  const refundAmount = amount ?? remaining;
  if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
    throw badRequest("Refund amount must be a positive integer minor-unit amount.");
  }
  if (refundAmount > remaining) {
    throw conflict("Refund amount exceeds the remaining refundable amount.");
  }

  const stripe = getStripeClient();
  const refund = await stripe.refunds.create(
    {
      payment_intent: payment.providerPaymentIntentId,
      amount: toStripeAmount(refundAmount, payment.currency),
      reason,
      reverse_transfer: Boolean(payment.providerConnectedAccountId),
      refund_application_fee: payment.platformFeeAmount > 0,
      metadata: {
        workspaceId,
        paymentId,
        bookingId: payment.bookingId,
      },
    },
    { idempotencyKey: `tripistic-refund-${workspaceId}-${paymentId}-${idempotencyKey}` },
  );

  const balanceTransactionId =
    typeof refund.balance_transaction === "string" ? refund.balance_transaction : (refund.balance_transaction?.id ?? null);
  const newRefundedAmount = Math.min(payment.amount, (payment.refundedAmount ?? 0) + refundAmount);
  const isFullRefund = newRefundedAmount >= payment.amount;

  const [refundRow] = await prisma.$transaction([
    prisma.paymentRefund.upsert({
      where: { providerRefundId: refund.id },
      create: {
        workspaceId,
        paymentId,
        provider: "stripe",
        providerRefundId: refund.id,
        providerBalanceTxnId: balanceTransactionId,
        amount: refundAmount,
        currency: payment.currency,
        status: refund.status ?? "pending",
        reason,
        createdById: userId,
        metadata: { idempotencyKey },
      },
      update: {
        providerBalanceTxnId: balanceTransactionId,
        status: refund.status ?? "pending",
        metadata: { idempotencyKey },
      },
    }),
    prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isFullRefund ? "refunded" : "partially_refunded",
        refundedAmount: newRefundedAmount,
      },
    }),
  ]);

  return refundRow;
}

export function stripeRefundReasonValues(): readonly RefundReason[] {
  return ["duplicate", "fraudulent", "requested_by_customer"] as const;
}
