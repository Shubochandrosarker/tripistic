import { describe, expect, it } from "vitest";
import type { Payment, PaymentEvent, PaymentStatus } from "@prisma/client";
import {
  serializePaymentDetail,
  serializePaymentSummary,
  serializePublicPayment,
} from "@/lib/payments/serializers";

function fakePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay_1",
    workspaceId: "ws_1",
    bookingId: "booking_1",
    provider: "stripe",
    paymentAccountId: null,
    providerPaymentIntentId: "pi_secret_internal_id",
    providerCheckoutSessionId: "cs_secret_internal_id",
    providerChargeId: null,
    providerTransferId: null,
    providerBalanceTxnId: null,
    providerConnectedAccountId: null,
    amount: 10000,
    currency: "USD",
    platformFeeAmount: 0,
    stripeFeeAmount: null,
    status: "requires_payment" as PaymentStatus,
    paymentMethod: null,
    receiptUrl: null,
    failureCode: null,
    failureMessage: null,
    refundedAmount: null,
    expiresAt: new Date("2026-08-01T00:00:00Z"),
    metadata: { checkoutUrl: "https://checkout.stripe.com/pay/cs_secret_internal_id" },
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("serializePublicPayment", () => {
  it("includes the cached checkoutUrl while payable, and never internal Stripe references", () => {
    const result = serializePublicPayment(fakePayment()) as unknown as Record<string, unknown>;
    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_secret_internal_id");
    for (const forbidden of ["providerPaymentIntentId", "providerCheckoutSessionId", "failureCode", "failureMessage"]) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it("omits checkoutUrl once the payment is no longer payable (succeeded, failed, cancelled, refunded)", () => {
    for (const status of ["succeeded", "failed", "cancelled", "refunded", "partially_refunded"] as PaymentStatus[]) {
      const result = serializePublicPayment(fakePayment({ status }));
      expect(result?.checkoutUrl).toBeNull();
    }
  });

  it("includes checkoutUrl while processing (async payment method still clearing)", () => {
    const result = serializePublicPayment(fakePayment({ status: "processing" }));
    expect(result?.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_secret_internal_id");
  });

  it("only includes receiptUrl once the payment has succeeded", () => {
    const pending = serializePublicPayment(fakePayment({ receiptUrl: "https://pay.stripe.com/receipts/abc" }));
    expect(pending?.receiptUrl).toBeNull(); // still requires_payment — not shown yet

    const succeeded = serializePublicPayment(
      fakePayment({ status: "succeeded", receiptUrl: "https://pay.stripe.com/receipts/abc" }),
    );
    expect(succeeded?.receiptUrl).toBe("https://pay.stripe.com/receipts/abc");
  });

  it("returns null for a booking with no payment (a free booking)", () => {
    expect(serializePublicPayment(null)).toBeNull();
  });
});

describe("serializePaymentSummary", () => {
  it("exposes non-PII financial facts only", () => {
    const result = serializePaymentSummary(fakePayment({ refundedAmount: 2500 }));
    expect(result).toEqual({
      status: "requires_payment",
      amount: 10000,
      currency: "USD",
      refundedAmount: 2500,
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
  });
});

describe("serializePaymentDetail — gated by canViewBookingPII", () => {
  it("returns null for a viewer regardless of payment state", () => {
    expect(serializePaymentDetail(fakePayment(), "viewer")).toBeNull();
  });

  it("returns null when there is no payment at all", () => {
    expect(serializePaymentDetail(null, "workspace_owner")).toBeNull();
  });

  it("includes Stripe references, failure detail, and the event timeline for owner/admin/staff", () => {
    const events: PaymentEvent[] = [
      {
        id: "evt_row_2",
        workspaceId: "ws_1",
        paymentId: "pay_1",
        bookingId: "booking_1",
        provider: "stripe",
        providerEventId: "evt_2",
        providerAccountId: null,
        eventType: "payment_intent.succeeded",
        payload: {},
        processedAt: new Date("2026-07-02T00:00:00Z"),
        createdAt: new Date("2026-07-02T00:00:00Z"),
      },
      {
        id: "evt_row_1",
        workspaceId: "ws_1",
        paymentId: "pay_1",
        bookingId: "booking_1",
        provider: "stripe",
        providerEventId: "evt_1",
        providerAccountId: null,
        eventType: "checkout.session.completed",
        payload: {},
        processedAt: new Date("2026-07-01T12:00:00Z"),
        createdAt: new Date("2026-07-01T12:00:00Z"),
      },
      {
        id: "evt_row_unprocessed",
        workspaceId: "ws_1",
        paymentId: "pay_1",
        bookingId: "booking_1",
        provider: "stripe",
        providerEventId: "evt_3",
        providerAccountId: null,
        eventType: "some.unhandled.event",
        payload: {},
        processedAt: null,
        createdAt: new Date("2026-07-03T00:00:00Z"),
      },
    ];

    for (const role of ["workspace_owner", "workspace_admin", "staff"] as const) {
      const result = serializePaymentDetail({ ...fakePayment(), events }, role);
      expect(result?.providerPaymentIntentId).toBe("pi_secret_internal_id");
      expect(result?.providerCheckoutSessionId).toBe("cs_secret_internal_id");
      // Sorted chronologically, and the unprocessed (processedAt: null) row is excluded.
      expect(result?.events).toEqual([
        { eventType: "checkout.session.completed", createdAt: "2026-07-01T12:00:00.000Z" },
        { eventType: "payment_intent.succeeded", createdAt: "2026-07-02T00:00:00.000Z" },
      ]);
    }
  });
});
