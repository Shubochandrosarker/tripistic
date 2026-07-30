export type BillingInterval = "monthly" | "yearly";

export type CanonicalPlanSlug = "solo" | "operator" | "agency" | "enterprise";

export type PlanLimitKey =
  | "users"
  | "staff_viewers"
  | "active_tours"
  | "custom_domains"
  | "ai_credits_monthly"
  | "storage_gb"
  | "monthly_bookings"
  | "workspaces";

export type PlanFeatureKey =
  | "booking_engine"
  | "stripe_payments"
  | "stripe_connect"
  | "digital_waivers"
  | "customer_records"
  | "basic_analytics"
  | "csv_export"
  | "white_label"
  | "custom_domain"
  | "storefront_builder"
  | "booking_reminders"
  | "guide_scheduling"
  | "operations_dispatch"
  | "vehicles"
  | "suppliers"
  | "crm_pipeline"
  | "itinerary_builder"
  | "ai_growth_dashboard"
  | "advanced_ai"
  | "api_access"
  | "audit_logs"
  | "sso_saml";

export type CanonicalPlan = {
  slug: CanonicalPlanSlug;
  name: string;
  description: string;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  currency: "USD";
  trialDays: number;
  seatsLabel: string;
  summary: string;
  highlights: string[];
  features: string[];
  limits: Record<PlanLimitKey, number>;
  flags: Record<PlanFeatureKey, boolean>;
};

const baseFlags: Record<PlanFeatureKey, boolean> = {
  booking_engine: true,
  stripe_payments: true,
  stripe_connect: true,
  digital_waivers: true,
  customer_records: true,
  basic_analytics: true,
  csv_export: true,
  white_label: false,
  custom_domain: false,
  storefront_builder: true,
  booking_reminders: true,
  guide_scheduling: false,
  operations_dispatch: false,
  vehicles: false,
  suppliers: false,
  crm_pipeline: false,
  itinerary_builder: false,
  ai_growth_dashboard: true,
  advanced_ai: false,
  api_access: false,
  audit_logs: false,
  sso_saml: false,
};

export const TRIPISTIC_TRIAL_DAYS = 14;

export const canonicalPlans: readonly CanonicalPlan[] = [
  {
    slug: "solo",
    name: "Solo",
    description: "For independent guides launching a branded direct-booking website.",
    monthlyPriceCents: 2900,
    yearlyPriceCents: 27800,
    currency: "USD",
    trialDays: TRIPISTIC_TRIAL_DAYS,
    seatsLabel: "1 owner seat",
    summary: "For solo guides publishing a storefront and taking direct bookings.",
    highlights: [
      "White-label travel storefront",
      "Tripistic subdomain plus 1 custom domain",
      "Up to 20 active tours",
      "Stripe Connect onboarding and payouts",
      "Booking confirmations, reminders, waivers, and basic AI",
    ],
    features: [
      "1 workspace",
      "1 owner seat",
      "Tripistic subdomain",
      "1 custom domain with managed SSL",
      "White-label storefront",
      "Logo, favicon, brand colours, and typography preset",
      "Up to 20 active tours",
      "Schedules, availability, blackout dates, and capacity",
      "Direct bookings",
      "Stripe Connect onboarding and payouts",
      "Booking confirmations and reminders",
      "Customer records",
      "Digital waivers",
      "Basic analytics",
      "Basic AI copilot",
      "CSV export",
      "Email support",
      "14-day trial",
    ],
    limits: {
      users: 1,
      staff_viewers: 0,
      active_tours: 20,
      custom_domains: 1,
      ai_credits_monthly: 100,
      storage_gb: 5,
      monthly_bookings: -1,
      workspaces: 1,
    },
    flags: {
      ...baseFlags,
      white_label: true,
      custom_domain: true,
    },
  },
  {
    slug: "operator",
    name: "Operator",
    description: "For teams running daily departures, staff, and operations.",
    monthlyPriceCents: 14900,
    yearlyPriceCents: 149000,
    currency: "USD",
    trialDays: TRIPISTIC_TRIAL_DAYS,
    seatsLabel: "Up to 10 seats",
    summary: "For teams running daily departures and staff.",
    highlights: [
      "Everything in Solo",
      "CRM, leads, and tasks",
      "Live operations centre",
      "Guides, drivers, and vehicles",
      "Incident reporting and manifests",
    ],
    features: [
      "Everything in Solo",
      "Up to 10 seats",
      "CRM pipeline",
      "Guide and driver scheduling",
      "Operations and dispatch board",
      "Vehicles and incidents",
      "Audit logs",
      "Priority email support",
    ],
    limits: {
      users: 10,
      staff_viewers: 10,
      active_tours: -1,
      custom_domains: 1,
      ai_credits_monthly: 500,
      storage_gb: 25,
      monthly_bookings: -1,
      workspaces: 1,
    },
    flags: {
      ...baseFlags,
      white_label: true,
      custom_domain: true,
      guide_scheduling: true,
      operations_dispatch: true,
      vehicles: true,
      crm_pipeline: true,
      audit_logs: true,
    },
  },
  {
    slug: "agency",
    name: "Agency",
    description: "For agencies and DMCs managing brands, suppliers, and proposals.",
    monthlyPriceCents: 39900,
    yearlyPriceCents: 399000,
    currency: "USD",
    trialDays: TRIPISTIC_TRIAL_DAYS,
    seatsLabel: "Up to 30 seats",
    summary: "For agencies and DMCs building itineraries and partner workflows.",
    highlights: [
      "Everything in Operator",
      "Multiple brands/workspaces",
      "Suppliers, costs, and margins",
      "Itinerary proposals",
      "Advanced AI and integrations",
    ],
    features: [
      "Everything in Operator",
      "Up to 30 seats",
      "Up to 5 workspaces",
      "Multiple custom domains",
      "Supplier directory and invoices",
      "Itinerary proposal builder",
      "Advanced AI",
      "API access",
    ],
    limits: {
      users: 30,
      staff_viewers: 30,
      active_tours: -1,
      custom_domains: 5,
      ai_credits_monthly: 2500,
      storage_gb: 100,
      monthly_bookings: -1,
      workspaces: 5,
    },
    flags: {
      ...baseFlags,
      white_label: true,
      custom_domain: true,
      guide_scheduling: true,
      operations_dispatch: true,
      vehicles: true,
      suppliers: true,
      crm_pipeline: true,
      itinerary_builder: true,
      advanced_ai: true,
      api_access: true,
      audit_logs: true,
    },
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "For reseller controls, governance, and dedicated onboarding.",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    currency: "USD",
    trialDays: TRIPISTIC_TRIAL_DAYS,
    seatsLabel: "Unlimited seats",
    summary: "For platform operators, resellers, and governed deployments.",
    highlights: [
      "Everything in Agency",
      "Advanced audit and export controls",
      "Reseller and platform administration",
      "Data residency options",
      "Dedicated onboarding",
    ],
    features: [
      "Everything in Agency",
      "Unlimited seats",
      "Unlimited workspaces",
      "Advanced audit/export controls",
      "Data residency options",
      "Dedicated onboarding",
      "Negotiated DPA",
    ],
    limits: {
      users: -1,
      staff_viewers: -1,
      active_tours: -1,
      custom_domains: -1,
      ai_credits_monthly: -1,
      storage_gb: -1,
      monthly_bookings: -1,
      workspaces: -1,
    },
    flags: {
      ...baseFlags,
      white_label: true,
      custom_domain: true,
      guide_scheduling: true,
      operations_dispatch: true,
      vehicles: true,
      suppliers: true,
      crm_pipeline: true,
      itinerary_builder: true,
      advanced_ai: true,
      api_access: true,
      audit_logs: true,
      // No SAML/SSO implementation exists yet — auth is credentials-only.
      // The key is retained so seeded entitlement rows stay resolvable.
      sso_saml: false,
    },
  },
] as const;

export function getCanonicalPlan(slug: CanonicalPlanSlug): CanonicalPlan {
  const plan = canonicalPlans.find((item) => item.slug === slug);
  if (!plan) {
    throw new Error(`Unknown Tripistic plan: ${slug}`);
  }
  return plan;
}

export function effectiveMonthlyPriceCents(plan: CanonicalPlan): number | null {
  if (plan.yearlyPriceCents === null) return null;
  return Math.round(plan.yearlyPriceCents / 12);
}

/**
 * Non-throwing lookup by arbitrary slug.
 *
 * `getCanonicalPlan` throws on an unknown slug, which is right for code paths
 * that own the slug. This one is for reading a slug that came from the
 * database, where a plan seeded by an older release — or a custom enterprise
 * plan — is a legitimate state that must not crash a request.
 */
export function findCanonicalPlan(slug: string): CanonicalPlan | undefined {
  return canonicalPlans.find((item) => item.slug === slug);
}
