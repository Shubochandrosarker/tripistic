import { describe, expect, it } from "vitest";
import { toStripeAmount } from "@/lib/payments/stripe-client";

describe("toStripeAmount", () => {
  it("passes ordinary (2-decimal) currencies through unchanged — our storage already matches Stripe's minor-unit convention", () => {
    expect(toStripeAmount(5000, "USD")).toBe(5000);
    expect(toStripeAmount(999, "eur")).toBe(999); // case-insensitive
    expect(toStripeAmount(0, "GBP")).toBe(0);
  });

  it("converts zero-decimal currencies from our stored minor-unit convention to Stripe's major-unit one", () => {
    // Stored as 5000 (our uniform /100 convention, matching formatMoney) —
    // the real price is ¥50, and Stripe wants that literal integer for JPY.
    expect(toStripeAmount(5000, "JPY")).toBe(50);
    expect(toStripeAmount(5000, "jpy")).toBe(50); // case-insensitive
    expect(toStripeAmount(123456, "KRW")).toBe(1235); // rounds to nearest integer
  });

  it("rounds rather than truncates on a fractional result", () => {
    expect(toStripeAmount(150, "JPY")).toBe(2); // 1.5 rounds up
    expect(toStripeAmount(149, "JPY")).toBe(1); // 1.49 rounds down
  });
});
