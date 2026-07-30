import { describe, expect, it } from "vitest";

import { checkStripePriceConfig, describePriceConfig } from "@/lib/billing/config-check";

/**
 * Guards the startup check for Stripe subscription price configuration.
 *
 * Without it, a default deployment resolves no price from either source and
 * fails with a 409 at the moment a customer clicks Subscribe — so the first
 * person to find out billing is unconfigured is a paying customer, mid-checkout.
 */
describe("checkStripePriceConfig", () => {
  it("reports every paid plan/interval combination as missing when nothing is set", () => {
    const report = checkStripePriceConfig({}, new Set());
    expect(report.ok).toBe(false);
    // Three paid plans (solo, operator, agency) x two intervals. Enterprise is
    // contact-sales and has nothing to configure.
    expect(report.checked).toBe(6);
    expect(report.missing).toHaveLength(6);
  });

  it("names the exact environment variable an operator must set", () => {
    const report = checkStripePriceConfig({}, new Set());
    const solo = report.missing.find((m) => m.planSlug === "solo" && m.interval === "monthly");
    expect(solo?.envName).toBe("STRIPE_PRICE_SOLO_MONTHLY");
  });

  it("accepts an environment variable as configuration", () => {
    const report = checkStripePriceConfig(
      {
        STRIPE_PRICE_SOLO_MONTHLY: "price_123",
        STRIPE_PRICE_SOLO_YEARLY: "price_124",
        STRIPE_PRICE_OPERATOR_MONTHLY: "price_125",
        STRIPE_PRICE_OPERATOR_YEARLY: "price_126",
        STRIPE_PRICE_AGENCY_MONTHLY: "price_127",
        STRIPE_PRICE_AGENCY_YEARLY: "price_128",
      },
      new Set(),
    );
    expect(report.ok).toBe(true);
    expect(report.missing).toHaveLength(0);
  });

  it("treats a whitespace-only variable as unset", () => {
    // A blank line in an env file is not configuration.
    const report = checkStripePriceConfig({ STRIPE_PRICE_SOLO_MONTHLY: "   " }, new Set());
    expect(report.missing.some((m) => m.envName === "STRIPE_PRICE_SOLO_MONTHLY")).toBe(true);
  });

  it("accepts a seeded provider price as the alternative source", () => {
    // resolveStripeSubscriptionPriceId falls back to plan_prices.provider_price_id,
    // so the check must honour the same fallback or it would report a false alarm.
    const report = checkStripePriceConfig({}, new Set(["solo:monthly"]));
    expect(report.missing.some((m) => m.planSlug === "solo" && m.interval === "monthly")).toBe(false);
    expect(report.missing).toHaveLength(5);
  });

  it("never asks for a price on a contact-sales plan", () => {
    const report = checkStripePriceConfig({}, new Set());
    expect(report.missing.some((m) => m.planSlug === "enterprise")).toBe(false);
  });
});

describe("describePriceConfig", () => {
  it("confirms completeness when everything is configured", () => {
    const message = describePriceConfig({ ok: true, missing: [], checked: 6 });
    expect(message).toContain("all 6");
  });

  it("lists the missing variables without echoing any configured value", () => {
    const env = { STRIPE_PRICE_SOLO_MONTHLY: "price_secret_do_not_echo" };
    const message = describePriceConfig(checkStripePriceConfig(env, new Set()));
    expect(message).toContain("STRIPE_PRICE_SOLO_YEARLY");
    // Diagnostics must not leak configured identifiers into logs.
    expect(message).not.toContain("price_secret_do_not_echo");
  });
});
