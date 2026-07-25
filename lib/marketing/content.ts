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
  { value: "24/7", label: "AI-ready operations context" },
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
    title: "AI",
    eyebrow: "Native intelligence",
    summary: "AI itinerary generation, growth insights, command palette search, and provider configuration turn daily operations into a living knowledge base.",
    benefits: ["AI itinerary builder", "Business health insights", "Command palette", "Provider-ready architecture"],
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
    summary: "AI growth recommendations, CRM data, review workflows, and partner tracking help operators convert demand into repeatable revenue.",
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
    summary: "Stripe, maps, calendars, messaging, AI providers, automation tools, webhooks, and REST APIs connect Tripistic to the operator stack.",
    benefits: ["Stripe", "OpenAI and OpenRouter", "Webhooks", "REST API"],
    related: ["API", "Automation", "White Label"],
  },
];

export const solutions: Solution[] = [
  {
    slug: "tour-operators",
    title: "Tour Operators",
    audience: "Independent and growing tour teams",
    challenges: ["Fragmented bookings", "Manual guide scheduling", "No clean revenue visibility"],
    solution: "Tripistic unifies the booking engine, operations center, CRM, and AI growth layer into one system.",
    benefits: ["Operate every departure from one dashboard", "Reduce repetitive admin", "Grow direct bookings without commission"],
  },
  {
    slug: "travel-agencies",
    title: "Travel Agencies",
    audience: "Agencies selling packages and partner inventory",
    challenges: ["Complex client itineraries", "Supplier coordination", "Brand consistency"],
    solution: "Build AI-assisted itineraries, manage vendors, and deliver branded portal experiences.",
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
    solution: "Combine CRM, AI itineraries, payment links, and branded guest portals.",
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
    solution: "Use white-label branding, private itineraries, AI assistance, and operations visibility.",
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
    solution: "Tripistic v2 adds super admin, white label, custom domains, AI providers, health, and maintenance controls.",
    benefits: ["Platform administration", "Brand governance", "Tenant-ready architecture"],
  },
];

export const integrations = [
  "Stripe",
  "Google Maps",
  "Google Calendar",
  "Twilio",
  "WhatsApp",
  "OpenAI",
  "OpenRouter",
  "Cloudflare",
  "n8n",
  "Zapier",
  "Webhooks",
  "REST API",
];

export const comparisonRows = [
  ["AI itinerary builder", "Included", "Limited", "Limited", "Limited", "Limited", "Limited"],
  ["Operations center", "Included", "Partial", "Partial", "Partial", "Partial", "No"],
  ["White label", "Platform-native", "Limited", "Limited", "Limited", "Limited", "No"],
  ["CRM timeline", "Included", "Basic", "Basic", "Basic", "Basic", "Basic"],
  ["Custom domains", "v2 foundation", "Limited", "Limited", "Limited", "Limited", "No"],
  ["Direct booking commission", "0%", "Varies", "Varies", "Varies", "Varies", "Varies"],
];
