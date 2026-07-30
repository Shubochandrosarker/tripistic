import { prisma } from "@/lib/db";

/**
 * Recurring-revenue aggregation for the platform admin console.
 *
 * Replaces an application-side calculation that was wrong in three ways at
 * once, silently:
 *
 *  1. It summed over a `take: 100` page, so past 100 subscriptions MRR
 *     under-reported with no warning at all.
 *  2. It added `plan.priceMonthly` for every active subscription regardless of
 *     billing interval, so an annual subscriber — billed at roughly ten months
 *     for twelve — was counted as if they paid monthly, inflating MRR by ~20%
 *     for every annual customer.
 *  3. It formatted the total with `formatMoney(mrr)`, which defaults to USD,
 *     while the per-row table correctly used each plan's own currency. Totals
 *     across currencies were added together and stamped with a dollar sign.
 *
 * All three are corrected here: aggregation happens in the database, annual
 * subscriptions are normalized to a monthly figure, and currencies are never
 * combined — they are reported as separate lines.
 */

/** Normalized recurring revenue for one currency. */
export type CurrencyRevenue = {
  currency: string;
  /** Monthly recurring revenue in integer minor units. */
  mrrMinor: number;
  /** Annual run rate, derived from normalized MRR. */
  arrMinor: number;
  activeSubscriptions: number;
};

export type PlanMixEntry = {
  slug: string;
  name: string;
  subscriptions: number;
  /** Share of all counted subscriptions, 0-100. */
  sharePercent: number;
};

export type RevenueSnapshot = {
  /** One entry per currency in use. Never summed together. */
  byCurrency: CurrencyRevenue[];
  planMix: PlanMixEntry[];
  totalActive: number;
  trialing: number;
  pastDue: number;
  cancelled: number;
  /** Active subscriptions as a share of active + trialing, 0-100. */
  trialConversionPercent: number | null;
};

/**
 * Monthly-equivalent price for one subscription, in minor units.
 *
 * An annual plan is divided by twelve rather than counted at its monthly
 * headline price. That is what makes the figure comparable across intervals —
 * the whole point of "monthly recurring revenue".
 */
export function monthlyEquivalentMinor(
  interval: string | null,
  priceMonthly: number,
  priceYearly: number,
): number {
  if (interval === "yearly" || interval === "annual") {
    return Math.round(priceYearly / 12);
  }
  return priceMonthly;
}

export async function getRevenueSnapshot(): Promise<RevenueSnapshot> {
  // Grouped in the database: no page limit, so the totals are complete
  // however many subscriptions exist.
  const [grouped, statusCounts, plans] = await Promise.all([
    prisma.subscription.groupBy({
      by: ["planId", "billingInterval"],
      where: { status: "active" },
      _count: { _all: true },
    }),
    prisma.subscription.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.plan.findMany({
      select: { id: true, slug: true, name: true, currency: true, priceMonthly: true, priceYearly: true },
    }),
  ]);

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const currencyTotals = new Map<string, CurrencyRevenue>();
  const planCounts = new Map<string, number>();
  let totalActive = 0;

  for (const row of grouped) {
    const plan = planById.get(row.planId);
    if (!plan) continue;

    const count = row._count._all;
    totalActive += count;
    planCounts.set(plan.id, (planCounts.get(plan.id) ?? 0) + count);

    const perSubscription = monthlyEquivalentMinor(
      row.billingInterval,
      plan.priceMonthly,
      plan.priceYearly,
    );

    const currency = plan.currency.toUpperCase();
    const existing = currencyTotals.get(currency) ?? {
      currency,
      mrrMinor: 0,
      arrMinor: 0,
      activeSubscriptions: 0,
    };
    existing.mrrMinor += perSubscription * count;
    existing.activeSubscriptions += count;
    currencyTotals.set(currency, existing);
  }

  const byCurrency = [...currencyTotals.values()]
    .map((entry) => ({ ...entry, arrMinor: entry.mrrMinor * 12 }))
    .sort((a, b) => b.mrrMinor - a.mrrMinor);

  // A real proportion of counted subscriptions — the previous bar used
  // `count * 12%`, which saturated at nine subscribers and represented nothing.
  const planMix: PlanMixEntry[] = plans
    .map((plan) => {
      const subscriptions = planCounts.get(plan.id) ?? 0;
      return {
        slug: plan.slug,
        name: plan.name,
        subscriptions,
        sharePercent: totalActive === 0 ? 0 : Math.round((subscriptions / totalActive) * 100),
      };
    })
    .sort((a, b) => b.subscriptions - a.subscriptions);

  const countFor = (status: string) =>
    statusCounts.find((row) => row.status === status)?._count._all ?? 0;

  const trialing = countFor("trialing");
  const conversionBase = totalActive + trialing;

  return {
    byCurrency,
    planMix,
    totalActive,
    trialing,
    pastDue: countFor("past_due"),
    cancelled: countFor("cancelled"),
    trialConversionPercent:
      conversionBase === 0 ? null : Math.round((totalActive / conversionBase) * 100),
  };
}
