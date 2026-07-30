import { describe, expect, it } from "vitest";

import { monthlyEquivalentMinor } from "@/lib/billing/revenue";

/**
 * The interval-normalization rule behind MRR.
 *
 * The previous admin calculation added `plan.priceMonthly` for every active
 * subscription regardless of interval, so an annual subscriber — billed at
 * roughly ten months for twelve — was counted as if they paid the full monthly
 * price. That inflated MRR by about 20% for every annual customer.
 */
describe("monthlyEquivalentMinor", () => {
  // Solo: $29/mo, $278/yr.
  const SOLO_MONTHLY = 2900;
  const SOLO_YEARLY = 27800;

  it("uses the monthly price for a monthly subscription", () => {
    expect(monthlyEquivalentMinor("monthly", SOLO_MONTHLY, SOLO_YEARLY)).toBe(2900);
  });

  it("divides the annual price by twelve rather than using the monthly price", () => {
    // 27800 / 12 = 2316.67 -> 2317, not 2900.
    expect(monthlyEquivalentMinor("yearly", SOLO_MONTHLY, SOLO_YEARLY)).toBe(2317);
  });

  it("treats 'annual' as a synonym for 'yearly'", () => {
    expect(monthlyEquivalentMinor("annual", SOLO_MONTHLY, SOLO_YEARLY)).toBe(
      monthlyEquivalentMinor("yearly", SOLO_MONTHLY, SOLO_YEARLY),
    );
  });

  it("falls back to the monthly price when the interval is unknown or null", () => {
    // Defaulting to the monthly figure keeps a missing interval from silently
    // dropping revenue to zero.
    expect(monthlyEquivalentMinor(null, SOLO_MONTHLY, SOLO_YEARLY)).toBe(2900);
    expect(monthlyEquivalentMinor("", SOLO_MONTHLY, SOLO_YEARLY)).toBe(2900);
  });

  it("never returns a fractional minor unit", () => {
    // Money is integer minor units end to end; a fractional cent would
    // propagate into every downstream total.
    for (const yearly of [27800, 149000, 399000, 1, 7]) {
      const value = monthlyEquivalentMinor("yearly", 0, yearly);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("an annual subscriber is worth less monthly recurring revenue than a monthly one", () => {
    // The direction of the correction, stated as an invariant: annual plans
    // are discounted, so normalizing must reduce the figure.
    const monthly = monthlyEquivalentMinor("monthly", SOLO_MONTHLY, SOLO_YEARLY);
    const annual = monthlyEquivalentMinor("yearly", SOLO_MONTHLY, SOLO_YEARLY);
    expect(annual).toBeLessThan(monthly);
  });
});
