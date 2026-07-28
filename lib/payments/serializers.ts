import type { Payment, PaymentEvent, WorkspaceRole } from "@prisma/client";
import { canViewBookingPII } from "@/lib/auth/permissions";
import { checkoutUrlFromPayment } from "./service";

/**
 * What a guest may see about their own payment — never Stripe's internal
 * payment intent/session ids, never a failure code. `checkoutUrl` is only
 * included while the payment is actually still payable, so a settled/failed
 * payment's response doesn't dangle a stale (possibly expired) link.
 * `receiptUrl` is Stripe's own customer-facing receipt — safe to return to
 * the booking's own guest by design, unlike every other Stripe reference.
 */
export type PublicPaymentSummary = {
  status: string;
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  receiptUrl: string | null;
};

export function serializePublicPayment(payment: Payment | null): PublicPaymentSummary | null {
  if (!payment) return null;
  const payable = payment.status === "requires_payment" || payment.status === "processing";
  return {
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    checkoutUrl: payable ? checkoutUrlFromPayment(payment) : null,
    receiptUrl: payment.status === "succeeded" ? payment.receiptUrl : null,
  };
}

/** Non-PII payment facts — safe for every role that can view the booking at all, including `viewer`. */
export type PaymentSummary = {
  status: string;
  amount: number;
  currency: string;
  refundedAmount: number | null;
  updatedAt: string;
};

export function serializePaymentSummary(payment: Payment | null): PaymentSummary | null {
  if (!payment) return null;
  return {
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    refundedAmount: payment.refundedAmount,
    updatedAt: payment.updatedAt.toISOString(),
  };
}

export type PaymentEventSummary = { eventType: string; createdAt: string };

/** Stripe references, failure detail, and the event timeline — gated by `canViewBookingPII`, same tier as guest contact info. */
export type PaymentDetail = PaymentSummary & {
  provider: string;
  providerPaymentIntentId: string | null;
  providerCheckoutSessionId: string | null;
  providerConnectedAccountId: string | null;
  providerChargeId: string | null;
  providerTransferId: string | null;
  providerBalanceTxnId: string | null;
  platformFeeAmount: number;
  stripeFeeAmount: number | null;
  receiptUrl: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  events: PaymentEventSummary[];
};

export function serializePaymentDetail(
  payment: (Payment & { events?: PaymentEvent[] }) | null,
  role: WorkspaceRole,
): PaymentDetail | null {
  if (!payment || !canViewBookingPII(role)) return null;
  const summary = serializePaymentSummary(payment);
  if (!summary) return null;
  return {
    ...summary,
    provider: payment.provider,
    providerPaymentIntentId: payment.providerPaymentIntentId,
    providerCheckoutSessionId: payment.providerCheckoutSessionId,
    providerConnectedAccountId: payment.providerConnectedAccountId,
    providerChargeId: payment.providerChargeId,
    providerTransferId: payment.providerTransferId,
    providerBalanceTxnId: payment.providerBalanceTxnId,
    platformFeeAmount: payment.platformFeeAmount,
    stripeFeeAmount: payment.stripeFeeAmount,
    receiptUrl: payment.receiptUrl,
    failureCode: payment.failureCode,
    failureMessage: payment.failureMessage,
    createdAt: payment.createdAt.toISOString(),
    events: (payment.events ?? [])
      .filter((event) => event.processedAt !== null)
      .map((event) => ({ eventType: event.eventType, createdAt: event.createdAt.toISOString() }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}
