export type PlanId = "solo" | "operator" | "agency" | "enterprise";

export type Plan = {
  id: PlanId;
  name: string;
  monthly: number | null;
  yearly: number | null;
  summary: string;
  seats: string;
  highlights: string[];
  cta: { label: string; href: string };
  popular?: boolean;
};

/** Annual billing is 20% off the monthly rate, charged up front. */
export const YEARLY_DISCOUNT = 0.2;

export const plans: Plan[] = [
  {
    id: "solo",
    name: "Solo",
    monthly: 49,
    yearly: Math.round(49 * 12 * (1 - YEARLY_DISCOUNT)),
    summary: "For independent guides launching direct bookings.",
    seats: "1 seat",
    highlights: [
      "Direct booking pages",
      "Tours, schedules, and availability",
      "Stripe payments and payment links",
      "Digital waivers",
      "Booking confirmations and reminders",
    ],
    cta: { label: "Start free", href: "/register" },
  },
  {
    id: "operator",
    name: "Operator",
    monthly: 149,
    yearly: Math.round(149 * 12 * (1 - YEARLY_DISCOUNT)),
    summary: "For teams running daily departures and staff.",
    seats: "Up to 10 seats",
    highlights: [
      "Everything in Solo",
      "CRM, leads, and tasks",
      "Live operations centre",
      "Guides, drivers, and vehicles",
      "Incident reporting and manifests",
    ],
    cta: { label: "Start free", href: "/register" },
    popular: true,
  },
  {
    id: "agency",
    name: "Agency",
    monthly: 399,
    yearly: Math.round(399 * 12 * (1 - YEARLY_DISCOUNT)),
    summary: "For agencies and DMCs building itineraries and partner workflows.",
    seats: "Up to 30 seats",
    highlights: [
      "Everything in Operator",
      "AI itinerary builder",
      "Vendors, costs, and margins",
      "Branded customer portal",
      "White label and custom domains",
    ],
    cta: { label: "Start free", href: "/register" },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthly: null,
    yearly: null,
    summary: "For platform operators, resellers, and governed deployments.",
    seats: "Unlimited seats",
    highlights: [
      "Everything in Agency",
      "Super-admin platform layer",
      "Multi-tenant provisioning",
      "AI provider governance",
      "Negotiated SLA and DPA",
    ],
    cta: { label: "Contact sales", href: "/contact" },
  },
];

export type ComparisonRow = {
  feature: string;
  values: Record<PlanId, string | boolean>;
};

export type ComparisonGroup = {
  group: string;
  rows: ComparisonRow[];
};

const row = (
  feature: string,
  solo: string | boolean,
  operator: string | boolean,
  agency: string | boolean,
  enterprise: string | boolean,
): ComparisonRow => ({ feature, values: { solo, operator, agency, enterprise } });

export const comparison: ComparisonGroup[] = [
  {
    group: "Bookings & payments",
    rows: [
      row("Public booking pages", true, true, true, true),
      row("Embeddable booking widget", true, true, true, true),
      row("Manual and phone bookings", true, true, true, true),
      row("Stripe payments and payment links", true, true, true, true),
      row("Deposits and partial payments", false, true, true, true),
      row("Digital waivers", true, true, true, true),
      row("Direct booking commission", "0%", "0%", "0%", "0%"),
    ],
  },
  {
    group: "Operations",
    rows: [
      row("Daily manifests and check-in", true, true, true, true),
      row("Live operations centre", false, true, true, true),
      row("Guide and driver scheduling", false, true, true, true),
      row("Vehicles and fleet records", false, true, true, true),
      row("Incident reporting", false, true, true, true),
      row("Dispatch board", false, true, true, true),
    ],
  },
  {
    group: "CRM & growth",
    rows: [
      row("Customer records and timeline", true, true, true, true),
      row("Leads and pipeline", false, true, true, true),
      row("Companies and agency clients", false, true, true, true),
      row("Segmentation and review requests", false, true, true, true),
      row("Vendors, costs, and margins", false, false, true, true),
    ],
  },
  {
    group: "AI",
    rows: [
      row("AI search across your data", false, true, true, true),
      row("AI itinerary builder", false, false, true, true),
      row("AI business insights", false, false, true, true),
      row("Bring your own AI provider key", false, true, true, true),
      row("Provider and model governance", false, false, false, true),
    ],
  },
  {
    group: "Brand & platform",
    rows: [
      row("Customer portal", false, true, true, true),
      row("Brand kit (logo, colours, emails)", false, false, true, true),
      row("Custom domains with SSL", false, false, true, true),
      row("PDF and invoice branding", false, false, true, true),
      row("Multi-tenant sub-workspaces", false, false, false, true),
      row("Reseller licence", false, false, false, true),
    ],
  },
  {
    group: "Platform & support",
    rows: [
      row("REST API and webhooks", true, true, true, true),
      row("Audit logs", false, true, true, true),
      row("Data export", true, true, true, true),
      row("Uptime target", "99.5%", "99.9%", "99.9%", "99.95%"),
      row("First response (business hours)", "1 day", "8 hours", "4 hours", "1 hour (P1)"),
      row("Named contact and 24×7 P1", false, false, false, true),
    ],
  },
];

export const pricingFaqs: readonly (readonly [string, string])[] = [
  [
    "Is there a free trial?",
    "Yes. Trials are fully functional — connect Stripe in test mode, run a booking end to end, then switch to live keys when you are ready. No card is required to start.",
  ],
  [
    "What counts as a seat?",
    "A seat is a named user with a login. Guides who receive manifests without logging in do not consume a seat, so a large field team does not force a larger plan.",
  ],
  [
    "Do you take commission on bookings?",
    "No. Direct bookings carry 0% commission from Tripistic. You pay your Stripe processing fees and nothing to us per booking.",
  ],
  [
    "Can I change plans later?",
    "Upgrades apply immediately and are prorated. Downgrades apply at your next renewal, so you keep what you paid for until the term ends.",
  ],
  [
    "What is included in annual billing?",
    "Annual billing saves 20% and is charged up front. You can request a full refund within 30 days of the charge.",
  ],
  [
    "Who handles traveller refunds?",
    "You do. Traveller payments flow through your own Stripe account under your own cancellation terms. Tripistic records the refund against the booking.",
  ],
  [
    "Do you offer a DPA and security review pack?",
    "Yes. A DPA with Standard Contractual Clauses is incorporated automatically, and enterprise teams can request security documentation and completed vendor questionnaires.",
  ],
  [
    "What happens to my data if I cancel?",
    "Your data stays exportable for 30 days after cancellation, then is deleted in line with our published retention schedule.",
  ],
];
