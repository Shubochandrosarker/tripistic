import { describe, expect, it } from "vitest";

import { calculatePlatformFeeAmount } from "@/lib/payments/connect";
import { toStripeAmount } from "@/lib/payments/stripe-client";

/**
 * docs/FINAL-LAUNCH-AUDIT.md §6.2: the application fee Stripe actually takes
 * and the `platformFeeAmount` this app persists were computed from amounts on
 * two different scales.
 *
 * `connectedPaymentIntentData` (connect.ts) derived the fee from
 * `toStripeAmount(total, currency)`; `createCheckoutSession` (service.ts)
 * derived it from the raw stored `booking.totalAmount`. Those agree for every
 * two-decimal currency and differ by exactly 100x for the zero-decimal ones,
 * so a JPY, KRW or VND booking recorded a platform fee a hundred times larger
 * than the money that actually moved.
 */

/** What `createCheckoutSession` now does. */
function feeAsPersisted(storedTotal: number, currency: string, bps: number): number {
  return calculatePlatformFeeAmount(toStripeAmount(storedTotal, currency), bps);
}

/** What `connectedPaymentIntentData` sends to Stripe as `application_fee_amount`. */
function feeAsCharged(storedTotal: number, currency: string, bps: number): number {
  return calculatePlatformFeeAmount(toStripeAmount(storedTotal, currency), bps);
}

const BPS = 200; // 2%

describe("platform fee scale", () => {
  it("records exactly the fee Stripe is asked to take, for a two-decimal currency", () => {
    // $50.00 stored as 5000 minor units; 2% = $1.00.
    expect(feeAsPersisted(5000, "USD", BPS)).toBe(100);
    expect(feeAsPersisted(5000, "USD", BPS)).toBe(feeAsCharged(5000, "USD", BPS));
  });

  it("records exactly the fee Stripe is asked to take, for a zero-decimal currency", () => {
    // ¥5000 stored as 500000 under this app's uniform /100 convention.
    // Stripe is sent 5000, so the fee it takes is 100 — not 10000.
    expect(toStripeAmount(500_000, "JPY")).toBe(5_000);
    expect(feeAsPersisted(500_000, "JPY", BPS)).toBe(100);
    expect(feeAsPersisted(500_000, "JPY", BPS)).toBe(feeAsCharged(500_000, "JPY", BPS));
  });

  it("would have over-reported the zero-decimal fee by 100x on the old code path", () => {
    // The pre-fix service.ts expression, preserved to document the defect.
    const preFix = calculatePlatformFeeAmount(500_000, BPS);
    expect(preFix).toBe(10_000);
    expect(preFix).toBe(feeAsCharged(500_000, "JPY", BPS) * 100);
  });

  it("agrees across every currency the platform can charge in", () => {
    for (const currency of ["USD", "EUR", "GBP", "AUD", "JPY", "KRW", "VND"]) {
      expect(feeAsPersisted(500_000, currency, BPS)).toBe(feeAsCharged(500_000, currency, BPS));
    }
  });
});

describe("calculatePlatformFeeAmount", () => {
  it("never returns a negative or fabricated fee", () => {
    expect(calculatePlatformFeeAmount(0, BPS)).toBe(0);
    expect(calculatePlatformFeeAmount(-100, BPS)).toBe(0);
    expect(calculatePlatformFeeAmount(5000, 0)).toBe(0);
    expect(calculatePlatformFeeAmount(5000, -50)).toBe(0);
  });

  it("floors, so the platform never takes more than its stated percentage", () => {
    // 2% of 1 minor unit is 0.02 — rounding up would overcharge the operator.
    expect(calculatePlatformFeeAmount(1, BPS)).toBe(0);
    expect(calculatePlatformFeeAmount(199, BPS)).toBe(3); // 3.98 -> 3
  });
});
