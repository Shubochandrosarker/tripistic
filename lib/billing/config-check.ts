import { canonicalPlans, type BillingInterval, type CanonicalPlanSlug } from "@/lib/plans/catalog";
import { stripePriceEnvName } from "@/lib/billing/stripe-billing";

/**
 * Startup validation of Stripe subscription price configuration.
 *
 * The failure this prevents: `STRIPE_PRICE_*` ships blank in both env
 * templates, and `prisma/seed.ts` never writes `providerPriceId`, so on a
 * default deployment *neither* source resolves. `resolveStripeSubscriptionPriceId`
 * then throws 409 — but only at the moment a customer clicks Subscribe. The
 * first person to discover that billing is unconfigured is a paying customer,
 * mid-checkout.
 *
 * Surfacing it at startup instead turns a silent revenue outage into a
 * deployment-time error, which is the whole point of a fail-fast check.
 */

export type PriceConfigIssue = {
  planSlug: CanonicalPlanSlug;
  interval: BillingInterval;
  envName: string;
};

export type PriceConfigReport = {
  ok: boolean;
  /** Combinations with neither an env var nor a seeded provider price. */
  missing: PriceConfigIssue[];
  checked: number;
};

/** Paid plans only — free and contact-sales plans have nothing to configure. */
function paidPlans() {
  return canonicalPlans.filter((plan) => Boolean(plan.monthlyPriceCents));
}

const INTERVALS: BillingInterval[] = ["monthly", "yearly"];

/**
 * Checks configuration without touching Stripe.
 *
 * `seededPriceIds` lets the caller supply what the database already has, so
 * this stays a pure function and can be unit-tested. Pass an empty set to
 * check environment variables alone.
 *
 * `env` is any env-shaped record — only STRIPE_PRICE_* keys are ever read.
 */
export function checkStripePriceConfig(
  env: Record<string, string | undefined>,
  seededPriceIds: ReadonlySet<string> = new Set(),
): PriceConfigReport {
  const missing: PriceConfigIssue[] = [];
  let checked = 0;

  for (const plan of paidPlans()) {
    for (const interval of INTERVALS) {
      checked += 1;
      const envName = stripePriceEnvName(plan.slug, interval);
      const fromEnv = env[envName]?.trim();
      const seedKey = `${plan.slug}:${interval}`;
      if (fromEnv || seededPriceIds.has(seedKey)) continue;
      missing.push({ planSlug: plan.slug, interval, envName });
    }
  }

  return { ok: missing.length === 0, missing, checked };
}

/** Operator-facing summary. Never includes a price ID or any secret value. */
export function describePriceConfig(report: PriceConfigReport): string {
  if (report.ok) {
    return `Stripe subscription prices configured for all ${report.checked} paid plan/interval combinations.`;
  }
  const lines = report.missing.map(
    (issue) => `  - ${issue.planSlug} ${issue.interval}: set ${issue.envName}`,
  );
  return [
    `Stripe subscription prices are missing for ${report.missing.length} of ${report.checked} paid plan/interval combinations.`,
    "Self-serve checkout will fail with a 409 for these until they are configured:",
    ...lines,
  ].join("\n");
}
