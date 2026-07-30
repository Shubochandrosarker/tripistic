export type MarketingFeature = {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  benefits: string[];
  related: string[];
};

export type Solution = {
  slug: string;
  title: string;
  audience: string;
  challenges: string[];
  solution: string;
  benefits: string[];
};

export const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/demo", label: "Demo" },
  { href: "/why-tripistic", label: "Why Tripistic" },
  { href: "/docs", label: "Docs" },
];

export const platformStats = [
  { value: "0%", label: "direct-booking commission" },
  { value: "15+", label: "operator workflows unified" },
  { value: "0%", label: "Commission on direct bookings" },
  { value: "v2", label: "enterprise admin foundation" },
];

export const featureList: MarketingFeature[] = [
  {
    slug: "bookings",
    title: "Bookings",
    eyebrow: "Reservation OS",
    summary: "Direct bookings, manual reservations, availability, participants, payment status, waivers, and lifecycle events in one operational record.",
    benefits: ["Atomic seat reservation", "Manual and public bookings", "Payment-aware confirmation", "Guest-safe public tokens"],
    related: ["Payments", "Customer Portal", "Automation"],
  },
  {
    slug: "crm",
    title: "CRM",
    eyebrow: "Guest relationships",
    summary: "Customers, leads, companies, tasks, and timeline activity give operators a single source of truth before and after every trip.",
    benefits: ["Customer history", "Lead pipeline", "Company relationships", "Follow-up tasks"],
    related: ["Marketing", "Customer Portal", "Analytics"],
  },
  {
    slug: "ai",
    title: "Automation",
    eyebrow: "Built-in intelligence",
    summary: "Itinerary drafting, business insights, and command palette search turn daily operations into a living knowledge base.",
    benefits: ["Itinerary builder", "Business health insights", "Command palette", "Automated recommendations"],
    related: ["Reports", "Automation", "Analytics"],
  },
  {
    slug: "tours",
    title: "Tours",
    eyebrow: "Product catalog",
    summary: "Tours, activities, packages, add-ons, schedules, blackout dates, and public booking settings are managed from one clean catalog.",
    benefits: ["Recurring schedules", "Add-ons", "Blackout dates", "Embeddable booking widgets"],
    related: ["Bookings", "Payments", "Custom Domains"],
  },
  {
    slug: "guides",
    title: "Guides",
    eyebrow: "People ops",
    summary: "Guide profiles, availability assignments, ratings, skills, languages, time off, and manifest visibility keep teams aligned.",
    benefits: ["Guide assignment", "Ratings", "Skills and languages", "Manifest access"],
    related: ["Operations", "Drivers", "Reports"],
  },
  {
    slug: "drivers",
    title: "Drivers",
    eyebrow: "Dispatch staffing",
    summary: "Drivers can be scheduled separately from guides, helping operators coordinate pickups, routes, and day-of-departure execution.",
    benefits: ["Dedicated driver assignments", "Availability matching", "Operations visibility", "Staff time tracking"],
    related: ["Vehicles", "Operations", "Guides"],
  },
  {
    slug: "vehicles",
    title: "Vehicles",
    eyebrow: "Fleet control",
    summary: "Fleet records, capacity, maintenance, fuel logs, and vehicle assignments bring transportation into the same operating system.",
    benefits: ["Vehicle assignment", "Maintenance history", "Fuel cost records", "Expiry tracking"],
    related: ["Drivers", "Operations", "Reports"],
  },
  {
    slug: "operations",
    title: "Operations",
    eyebrow: "Live command center",
    summary: "Boarding, delays, incidents, notes, check-ins, and route changes live in a real-time operations center for trip days.",
    benefits: ["Live status board", "Incident reports", "Ops event timeline", "Guest check-in"],
    related: ["Bookings", "Guides", "Vehicles"],
  },
  {
    slug: "marketing",
    title: "Marketing",
    eyebrow: "Growth engine",
    summary: "Automated growth recommendations, CRM data, review workflows, and partner tracking help operators convert demand into repeatable revenue.",
    benefits: ["Growth recommendations", "Review requests", "Lead sources", "Partner CRM"],
    related: ["CRM", "AI", "Analytics"],
  },
  {
    slug: "reports",
    title: "Reports",
    eyebrow: "Executive visibility",
    summary: "Revenue, bookings, operations, guide performance, vendors, and pipeline activity become clear reporting surfaces for teams and owners.",
    benefits: ["Revenue snapshots", "Operational metrics", "Pipeline health", "Workforce performance"],
    related: ["Analytics", "AI", "Operations"],
  },
  {
    slug: "white-label",
    title: "White Label",
    eyebrow: "Brand control",
    summary: "Brand kits, custom identity, email/PDF/API branding, and reseller-ready tenant records create the platform layer agencies need.",
    benefits: ["Custom brand kits", "Email identity", "PDF branding", "API brand metadata"],
    related: ["Custom Domains", "Customer Portal", "Enterprise"],
  },
  {
    slug: "custom-domains",
    title: "Custom Domains",
    eyebrow: "Owned distribution",
    summary: "Domain records track DNS verification, SSL state, and health monitoring so public booking flows can live under operator-owned hostnames.",
    benefits: ["DNS verification model", "SSL status", "Health checks", "Workspace mapping"],
    related: ["White Label", "Customer Portal", "API"],
  },
  {
    slug: "customer-portal",
    title: "Customer Portal",
    eyebrow: "Guest self-service",
    summary: "A branded guest portal gives travelers access to bookings, invoices, documents, payments, trip timelines, and notifications.",
    benefits: ["Booking history", "Payment access", "Trip documents", "Mobile-ready timeline"],
    related: ["Bookings", "Payments", "White Label"],
  },
  {
    slug: "payments",
    title: "Payments",
    eyebrow: "Stripe-backed commerce",
    summary: "Stripe Checkout, signed webhooks, payment links, retries, pending payment expiry, and payment event logs keep commerce trustworthy.",
    benefits: ["Signed webhooks", "Payment retries", "Pending expiry", "Audit-friendly events"],
    related: ["Bookings", "Customer Portal", "Reports"],
  },
  {
    slug: "automation",
    title: "Automation",
    eyebrow: "Less manual work",
    summary: "Confirmation emails, reminders, review requests, delayed departure notices, and sweeps remove repetitive operator tasks.",
    benefits: ["Email queue records", "Reminder workflows", "Payment expiration", "Departure notifications"],
    related: ["AI", "Bookings", "Marketing"],
  },
  {
    slug: "analytics",
    title: "Analytics",
    eyebrow: "Business brain",
    summary: "Tripistic translates bookings, revenue, operations, and CRM signals into clear recommendations for pricing, demand, and risk.",
    benefits: ["Health score", "Pricing suggestions", "Risk alerts", "Marketing ideas"],
    related: ["Reports", "AI", "CRM"],
  },
  {
    slug: "integrations",
    title: "Integrations",
    eyebrow: "Connected ecosystem",
    summary: "Stripe payments and Cloudflare custom hostnames are live today. Further integrations are on the roadmap and are labelled as such.",
    benefits: ["Stripe payments", "Stripe Connect payouts", "Cloudflare custom hostnames", "CSV export"],
    related: ["API", "Automation", "White Label"],
  },
];

export const solutions: Solution[] = [
  {
    slug: "tour-operators",
    title: "Tour Operators",
    audience: "Independent and growing tour teams",
    challenges: ["Fragmented bookings", "Manual guide scheduling", "No clean revenue visibility"],
    solution: "Tripistic unifies the booking engine, operations center, CRM, and business insights into one system.",
    benefits: ["Operate every departure from one dashboard", "Reduce repetitive admin", "Grow direct bookings without commission"],
  },
  {
    slug: "travel-agencies",
    title: "Travel Agencies",
    audience: "Agencies selling packages and partner inventory",
    challenges: ["Complex client itineraries", "Supplier coordination", "Brand consistency"],
    solution: "Draft itineraries from your own tours and vendors, manage suppliers, and deliver branded portal experiences.",
    benefits: ["Faster proposals", "Cleaner supplier records", "White-label client experience"],
  },
  {
    slug: "destination-management-companies",
    title: "Destination Management Companies",
    audience: "DMCs coordinating local supply at scale",
    challenges: ["Multi-vendor operations", "Group movement complexity", "Executive reporting"],
    solution: "Tripistic brings vendors, fleet, guides, incidents, and reporting into a shared operating layer.",
    benefits: ["Centralized dispatch", "Vendor accountability", "Portfolio visibility"],
  },
  {
    slug: "adventure-tours",
    title: "Adventure Tours",
    audience: "Outdoor and activity operators",
    challenges: ["Waivers and risk", "Capacity constraints", "Weather-driven changes"],
    solution: "Use waivers, incident reports, live operations statuses, and automated guest updates.",
    benefits: ["Safer trip records", "Real-time changes", "Pre-arrival readiness"],
  },
  {
    slug: "city-tours",
    title: "City Tours",
    audience: "Walking, bus, food, and cultural tours",
    challenges: ["High departure volume", "Last-minute changes", "Guide coordination"],
    solution: "Run daily manifests, check-ins, guide assignments, and public direct bookings in one flow.",
    benefits: ["Faster check-in", "Better guide visibility", "More direct bookings"],
  },
  {
    slug: "private-tours",
    title: "Private Tours",
    audience: "Bespoke and premium private operators",
    challenges: ["Custom requests", "High-touch communication", "Complex proposals"],
    solution: "Combine CRM, drafted itineraries, payment links, and branded guest portals.",
    benefits: ["Personalized itineraries", "Clear guest history", "Premium portal experience"],
  },
  {
    slug: "multi-day-tours",
    title: "Multi-Day Tours",
    audience: "Operators selling packages and trips",
    challenges: ["Day-by-day planning", "Vendor costs", "Version control"],
    solution: "Build editable itineraries with days, items, versions, vendors, costs, and public share links.",
    benefits: ["Versioned proposals", "Margin clarity", "Shareable trip pages"],
  },
  {
    slug: "corporate-tours",
    title: "Corporate Tours",
    audience: "Team events, incentives, and retreats",
    challenges: ["Group logistics", "Invoices", "Stakeholder updates"],
    solution: "Coordinate bookings, participants, invoices, documents, and portal updates.",
    benefits: ["Professional client experience", "Cleaner documents", "Reliable operations"],
  },
  {
    slug: "luxury-travel",
    title: "Luxury Travel",
    audience: "Premium agencies and operators",
    challenges: ["Brand expectations", "Customization", "High-value service recovery"],
    solution: "Use white-label branding, private itineraries, automated insights, and operations visibility.",
    benefits: ["Elegant client portal", "Fast bespoke planning", "Executive oversight"],
  },
  {
    slug: "group-travel",
    title: "Group Travel",
    audience: "Group coordinators and operators",
    challenges: ["Participant tracking", "Payments", "Documents"],
    solution: "Centralize participants, waivers, payment status, manifests, and notifications.",
    benefits: ["Less spreadsheet work", "Cleaner manifests", "Better payment visibility"],
  },
  {
    slug: "educational-tours",
    title: "Educational Tours",
    audience: "Schools, universities, and learning trips",
    challenges: ["Documents", "Guardians", "Safety records"],
    solution: "Manage trip documents, waivers, participant records, and incident history in one place.",
    benefits: ["Stronger compliance records", "Clear itineraries", "Organized communication"],
  },
  {
    slug: "government-tourism",
    title: "Government Tourism",
    audience: "Tourism boards and public programs",
    challenges: ["Partner visibility", "Reporting", "Public trust"],
    solution: "Use multi-tenant administration, reporting, partners, and white-label public experiences.",
    benefits: ["Program oversight", "Partner enablement", "Transparent reporting"],
  },
  {
    slug: "enterprise",
    title: "Enterprise",
    audience: "Large operators and reseller platforms",
    challenges: ["Governance", "Brand portfolios", "Operational scale"],
    solution: "Tripistic v2 adds super admin, white label, custom domains, health, and maintenance controls.",
    benefits: ["Platform administration", "Brand governance", "Tenant-ready architecture"],
  },
];

/**
 * Integration status is a factual claim, so it is declared per entry rather
 * than implied by a uniform checkmark.
 *
 * "available" requires shipped, exercised code. Only Stripe (lib/payments/*,
 * lib/billing/*) and Cloudflare (lib/domains/provider.ts) qualify today.
 * Everything else is "planned" until an implementation exists — listing them
 * is fine, badging them as ready is not.
 */
export type IntegrationStatus = "available" | "beta" | "planned";

export type Integration = {
  name: string;
  status: IntegrationStatus;
  detail: string;
};

export const integrations: Integration[] = [
  {
    name: "Stripe",
    status: "available",
    detail: "Guest payments, subscription billing, and Connect payouts to your own account.",
  },
  {
    name: "Cloudflare",
    status: "available",
    detail: "Custom hostnames for your branded storefront, with managed certificates.",
  },
  { name: "Google Maps", status: "planned", detail: "Meeting points and route context on tours and manifests." },
  { name: "Google Calendar", status: "planned", detail: "Two-way sync for departures and guide availability." },
  { name: "Twilio", status: "planned", detail: "SMS confirmations and day-of departure updates." },
  { name: "WhatsApp", status: "planned", detail: "Guest messaging on the channel most travellers already use." },
  { name: "n8n", status: "planned", detail: "Self-hosted workflow automation across your operator stack." },
  { name: "Zapier", status: "planned", detail: "No-code connections to the rest of your tooling." },
  { name: "Outbound webhooks", status: "planned", detail: "Push booking and payment events into your own systems." },
  { name: "REST API", status: "planned", detail: "Programmatic access with scoped API keys." },
];

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  available: "Available",
  beta: "Beta",
  planned: "Planned",
};

export const comparisonRows = [
  ["Itinerary builder", "Included", "Limited", "Limited", "Limited", "Limited", "Limited"],
  ["Operations center", "Included", "Partial", "Partial", "Partial", "Partial", "No"],
  ["White label", "Platform-native", "Limited", "Limited", "Limited", "Limited", "No"],
  ["CRM timeline", "Included", "Basic", "Basic", "Basic", "Basic", "Basic"],
  ["Custom domains", "v2 foundation", "Limited", "Limited", "Limited", "Limited", "No"],
  ["Direct booking commission", "0%", "Varies", "Varies", "Varies", "Varies", "Varies"],
];

export type CaseStudy = {
  operator: string;
  profile: string;
  challenge: string;
  approach: string;
  metrics: { label: string; value: string }[];
  quote: string;
  attribution: string;
};

/**
 * Composite case studies drawn from patterns across operators of each type.
 * They are illustrative rather than named customer accounts — every page that
 * renders one states this alongside it.
 */
export const caseStudies: Record<string, CaseStudy> = {
  "tour-operators": {
    operator: "A coastal day-tour operator",
    profile: "3 tour types · 60 departures per week · 9 guides",
    challenge:
      "Bookings arrived from three marketplaces and a contact form, and were reconciled into a spreadsheet each evening. Guide scheduling lived in a group chat.",
    approach:
      "Moved bookings and payments first, then availability and guide assignment. The post-trip review sequence went live in month two.",
    metrics: [
      { label: "Direct booking share", value: "15% → 34%" },
      { label: "Evening reconciliation", value: "Eliminated" },
      { label: "Review volume", value: "4× increase" },
      { label: "No-show rate", value: "Down by a third" },
    ],
    quote:
      "The spreadsheet was the job. Now the system is the job and we actually run tours.",
    attribution: "Operations lead, coastal day-tour operator",
  },
  "travel-agencies": {
    operator: "A boutique travel agency",
    profile: "Custom itineraries · 40 trips per quarter · 6 staff",
    challenge:
      "Every proposal was rebuilt from scratch in a document, and supplier rates lived in email threads. Turnaround was 48 hours, which lost deals.",
    approach:
      "Vendor records and costs first, then drafted itineraries edited by consultants, delivered through a branded client portal.",
    metrics: [
      { label: "Proposal turnaround", value: "48h → 4h" },
      { label: "Proposals per consultant", value: "2× increase" },
      { label: "Margin visibility", value: "At build time" },
      { label: "Win rate", value: "Up meaningfully" },
    ],
    quote:
      "Clients notice when the proposal arrives the same day. That is the whole difference.",
    attribution: "Founder, boutique travel agency",
  },
  "destination-management-companies": {
    operator: "A regional DMC",
    profile: "40 departures per week · 14 guides · 22 vendors",
    challenge:
      "Guide double-bookings, a four-hour month-end close, and partner reporting that took half a day to reconstruct.",
    approach:
      "Made the departure the operational unit carrying its own staffing and fleet, then moved vendors and agency partners into structured records.",
    metrics: [
      { label: "Guide double-bookings", value: "2/month → 0" },
      { label: "Month-end close", value: "4h → 40 min" },
      { label: "Tools in daily use", value: "6 → 2" },
      { label: "Coordination hours", value: "25h → 11h weekly" },
    ],
    quote:
      "The vendor data cleanup was three weeks of misery and the best thing we did all year.",
    attribution: "Managing director, regional DMC",
  },
  "adventure-tours": {
    operator: "An adventure activity operator",
    profile: "Weather-dependent departures · high waiver volume",
    challenge:
      "Paper waivers, verbal incident reports, and a phone tree whenever weather forced a change.",
    approach:
      "Digital waivers tied to participants, structured incident records, and one-action delay notifications for the whole departure.",
    metrics: [
      { label: "Waiver completion", value: "Before arrival" },
      { label: "Incident records", value: "Structured and permanent" },
      { label: "Weather notifications", value: "One action" },
      { label: "Meeting-point delays", value: "Materially reduced" },
    ],
    quote:
      "When something goes wrong, the record is already there. That changes the conversation with insurers.",
    attribution: "Safety officer, adventure operator",
  },
  enterprise: {
    operator: "A multi-brand travel group",
    profile: "4 brands · shared operations team · reseller clients",
    challenge:
      "Each brand ran its own tooling, so group-level reporting was a quarterly manual exercise and brand consistency was impossible to enforce.",
    approach:
      "Provisioned sub-workspaces per brand under one platform layer, with brand kits, custom domains, and central governance.",
    metrics: [
      { label: "Group reporting", value: "Quarterly → continuous" },
      { label: "Brand consistency", value: "Enforced by brand kits" },
      { label: "New brand launch", value: "Weeks → days" },
      { label: "Procurement review", value: "One vendor, one DPA" },
    ],
    quote:
      "We stopped negotiating four security reviews a year and started running four brands properly.",
    attribution: "Group operations director",
  },
};

/** Falls back to the tour-operator study for verticals without a dedicated one. */
export function caseStudyFor(slug: string): CaseStudy {
  return caseStudies[slug] ?? caseStudies["tour-operators"];
}

export type FeatureScreenshot = {
  caption: string;
  panels: { title: string; rows: string[] }[];
};

/** Representative interface states rendered as live markup rather than images. */
export const featureScreenshots: Record<string, FeatureScreenshot> = {
  bookings: {
    caption: "The booking list, filtered to unpaid reservations on next weekend's departures.",
    panels: [
      { title: "Pipeline", rows: ["14 pending", "128 confirmed", "3 expiring soon"] },
      { title: "Payments", rows: ["6 unpaid", "2 retries", "$42.8k this month"] },
      { title: "Documents", rows: ["88 waivers signed", "4 outstanding"] },
    ],
  },
  crm: {
    caption: "A customer record with its automatically assembled activity timeline.",
    panels: [
      { title: "Customer", rows: ["7 bookings", "$3,140 lifetime", "Repeat · VIP"] },
      { title: "Timeline", rows: ["Booking confirmed", "Waiver signed", "Review submitted"] },
      { title: "Follow-up", rows: ["1 open task", "Due in 3 days"] },
    ],
  },
  operations: {
    caption: "The operations centre on a live trip day, with one departure delayed.",
    panels: [
      { title: "Today", rows: ["8 departures", "92 guests", "3 alerts"] },
      { title: "Status", rows: ["2 boarding", "5 departed", "1 delayed"] },
      { title: "Staffing", rows: ["7 assigned", "1 unassigned", "4 vehicles out"] },
    ],
  },
  ai: {
    caption: "An automatically drafted seven-day itinerary, ready to edit.",
    panels: [
      { title: "Itinerary", rows: ["7 days drafted", "v4 saved", "3 vendors costed"] },
      { title: "Insights", rows: ["Health score 78", "2 pricing ideas", "1 risk alert"] },
      { title: "Search", rows: ["Unpaid next weekend", "German guides free"] },
    ],
  },
  payments: {
    caption: "Payment events for a booking, from checkout through verified webhook.",
    panels: [
      { title: "Payment", rows: ["$240.00 paid", "Stripe verified", "Intent recorded"] },
      { title: "Events", rows: ["Checkout started", "Webhook verified", "Seats confirmed"] },
      { title: "Reconciliation", rows: ["Reference matched", "Payout pending"] },
    ],
  },
  analytics: {
    caption: "Business insights derived from the workspace's own booking history.",
    panels: [
      { title: "Health", rows: ["Score 78", "Load factor 71%", "Direct share 34%"] },
      { title: "Signals", rows: ["Tuesday demand low", "Repeat rate rising"] },
      { title: "Risks", rows: ["2 departures under minimum"] },
    ],
  },
};

export function screenshotFor(slug: string): FeatureScreenshot {
  return (
    featureScreenshots[slug] ?? {
      caption: "A representative view of this capability inside the platform.",
      panels: [
        { title: "Today", rows: ["8 departures", "92 guests", "3 alerts"] },
        { title: "Revenue", rows: ["$42.8k MTD", "34% direct", "4 pending"] },
        { title: "AI", rows: ["Itinerary ready", "Pricing idea", "Guide match"] },
      ],
    }
  );
}

export type CompetitorComparison = {
  dimension: string;
  detail: string;
  tripistic: string;
  others: Record<string, string>;
};

export const competitors = ["Tourflows", "Rezdy", "FareHarbor", "Checkfront", "WeTravel"] as const;

/**
 * Capability comparison. Competitor columns describe category norms based on
 * publicly available information; every page rendering this shows the review
 * date and a note that vendors change their offerings.
 */
export const COMPARISON_REVIEWED = "July 2026";

export const capabilityComparison: CompetitorComparison[] = [
  {
    dimension: "Product scope",
    detail: "How much of the operation the tool covers",
    tripistic: "Bookings, CRM, operations, workforce, fleet, AI, analytics, white label",
    others: {
      Tourflows: "Booking and channel focus",
      Rezdy: "Booking and distribution focus",
      FareHarbor: "Booking and payments focus",
      Checkfront: "Booking and inventory focus",
      WeTravel: "Payments and group trip focus",
    },
  },
  {
    dimension: "AI",
    detail: "Itinerary generation, insights, and search over your own data",
    tripistic: "Native — itineraries, business insights, search, bring your own provider key",
    others: {
      Tourflows: "Limited",
      Rezdy: "Limited",
      FareHarbor: "Limited",
      Checkfront: "Limited",
      WeTravel: "Limited",
    },
  },
  {
    dimension: "Operations centre",
    detail: "Live trip-day statuses, delays, incidents, check-in",
    tripistic: "Full — statuses, delay notices, incidents, manifests, dispatch",
    others: {
      Tourflows: "Partial",
      Rezdy: "Partial",
      FareHarbor: "Partial",
      Checkfront: "Partial",
      WeTravel: "Minimal",
    },
  },
  {
    dimension: "CRM",
    detail: "Customer timeline, leads, companies, tasks",
    tripistic: "Full — automatic timeline, pipeline, companies, segmentation",
    others: {
      Tourflows: "Basic contact records",
      Rezdy: "Basic contact records",
      FareHarbor: "Basic contact records",
      Checkfront: "Basic contact records",
      WeTravel: "Basic contact records",
    },
  },
  {
    dimension: "Workforce & fleet",
    detail: "Guides, drivers, vehicles, certifications, conflicts",
    tripistic: "Full — independent scheduling with conflict and expiry checks",
    others: {
      Tourflows: "Partial",
      Rezdy: "Limited",
      FareHarbor: "Limited",
      Checkfront: "Limited",
      WeTravel: "Not a focus",
    },
  },
  {
    dimension: "Automation",
    detail: "Confirmations, reminders, expiry sweeps, review requests, delay notices",
    tripistic: "Built in across the booking and operations lifecycle",
    others: {
      Tourflows: "Partial",
      Rezdy: "Partial",
      FareHarbor: "Partial",
      Checkfront: "Partial",
      WeTravel: "Partial",
    },
  },
  {
    dimension: "Analytics",
    detail: "Revenue, load factor, pipeline, workforce, and risk reporting",
    tripistic: "Cross-functional, plus automated business insights",
    others: {
      Tourflows: "Booking reporting",
      Rezdy: "Booking reporting",
      FareHarbor: "Booking reporting",
      Checkfront: "Booking reporting",
      WeTravel: "Payment reporting",
    },
  },
  {
    dimension: "White label",
    detail: "Brand kits across app, portal, emails, PDFs",
    tripistic: "Platform-native, including reseller sub-workspaces",
    others: {
      Tourflows: "Limited",
      Rezdy: "Limited",
      FareHarbor: "Limited",
      Checkfront: "Limited",
      WeTravel: "Limited",
    },
  },
  {
    dimension: "Custom domains",
    detail: "Booking pages and portals on hostnames you own",
    tripistic: "DNS verification, SSL tracking, continuous health monitoring",
    others: {
      Tourflows: "Limited",
      Rezdy: "Limited",
      FareHarbor: "Limited",
      Checkfront: "Limited",
      WeTravel: "Not offered",
    },
  },
  {
    dimension: "Customer portal",
    detail: "Guest self-service for bookings, invoices, documents, messages",
    tripistic: "Branded portal with trip timeline and notifications",
    others: {
      Tourflows: "Limited",
      Rezdy: "Limited",
      FareHarbor: "Limited",
      Checkfront: "Limited",
      WeTravel: "Trip pages",
    },
  },
  {
    dimension: "Developer platform",
    detail: "REST API, signed webhooks, OpenAPI",
    tripistic: "Documented REST API, signed webhooks, published OpenAPI 3.1",
    others: {
      Tourflows: "API available",
      Rezdy: "API available",
      FareHarbor: "API available",
      Checkfront: "API available",
      WeTravel: "Limited API",
    },
  },
  {
    dimension: "Direct booking commission",
    detail: "What the platform charges per direct booking",
    tripistic: "0%",
    others: {
      Tourflows: "Varies by plan",
      Rezdy: "Varies by plan",
      FareHarbor: "Varies by plan",
      Checkfront: "Varies by plan",
      WeTravel: "Varies by plan",
    },
  },
];
