import Link from "next/link";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  Globe2,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  CtaBand,
  FaqSection,
  FeatureGrid,
  HeroSection,
  ProductPreview,
  SectionIntro,
} from "@/components/marketing/marketing-sections";
import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { JsonLd } from "@/components/marketing/json-ld";
import { ButtonLink } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { faqSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/";
const TITLE = "Tripistic v2.0.0 — AI Travel Operations Platform";
const DESCRIPTION =
  "Tripistic is the AI-native operating system for tour operators, agencies, DMCs, and travel brands: bookings, CRM, operations, guides, vehicles, AI itineraries, analytics, white label, and custom domains.";

export const metadata = buildMetadata({
  title: TITLE,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "AI Travel Operating System",
  keywords: [
    "tour operator software",
    "travel operations platform",
    "booking software for tour operators",
    "ai travel software",
    "white label booking software",
    "dmc software",
  ],
});

/** Mirrors the questions rendered by FaqSection so the structured data matches the page. */
const HOME_FAQS = [
  [
    "Is Tripistic only for tour operators?",
    "No. It supports operators, travel agencies, DMCs, private-tour teams, education travel, and enterprise travel brands.",
  ],
  [
    "Does Tripistic replace my booking tool?",
    "Tripistic includes direct booking, availability, payments, waivers, operations, CRM, and AI workflows in one system.",
  ],
  [
    "Can agencies white-label the platform?",
    "Yes. v2 includes the enterprise data model and admin surfaces for brand kits, custom domains, API branding, and reseller-ready operations.",
  ],
  [
    "Does it support AI itineraries?",
    "Yes. The itinerary builder creates editable multi-day proposals from tours, vendors, and trip context, then tracks versions.",
  ],
] as const;

const pillars = [
  {
    icon: CalendarCheck,
    title: "Booking engine",
    text: "Direct booking pages, availability, add-ons, Stripe payments, manual reservations, waivers, and guest-safe confirmation flows.",
  },
  {
    icon: Users,
    title: "CRM and customer timeline",
    text: "Customers, leads, companies, tasks, messages, activity history, and partner relationships stay connected to every booking.",
  },
  {
    icon: Radio,
    title: "Operations command center",
    text: "Departure status, check-ins, guide and vehicle assignment, incidents, delays, route notes, and manifests in one live board.",
  },
  {
    icon: Sparkles,
    title: "AI-native workflows",
    text: "AI itineraries, command search, growth insights, pricing suggestions, business health, and provider-ready intelligence.",
  },
  {
    icon: Globe2,
    title: "White label platform",
    text: "Brand kits, custom domains, branded login, email, PDF, API identity, and reseller-ready multi-tenant administration.",
  },
  {
    icon: BarChart3,
    title: "Advanced analytics",
    text: "Revenue, MRR, ARR, plan mix, booking performance, operational health, guide performance, and reporting foundations.",
  },
];

// Verifiable engineering guarantees, not customer quotes. Tripistic is
// pre-launch and has no customers to quote; inventing endorsements would be
// both false and, under FTC endorsement guidance, unlawful. Every claim below
// maps to code and to a test that would fail if it stopped being true.
const trustPillars = [
  {
    title: "Tenant isolation on every route",
    detail:
      "Each workspace-scoped API verifies membership server-side before it reads or writes, and returns 404 rather than 403 so that data outside your workspace cannot even be probed for existence.",
  },
  {
    title: "Departures cannot be oversold",
    detail:
      "Seats are reserved in a single atomic database statement, backed by table constraints that hold regardless of application code. Proven by a test that races twelve concurrent bookings for three seats.",
  },
  {
    title: "Payment is confirmed by Stripe, not by a redirect",
    detail:
      "A booking is only ever confirmed from a signature-verified Stripe webhook. Returning from checkout confirms nothing on its own, so an interrupted or forged return cannot create a paid-looking booking.",
  },
];

export default function HomePage() {
  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          faqSchema(HOME_FAQS),
        ]}
      />
      <HeroSection />
      <div id="main">

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Platform"
            title="One operating system for the whole travel business."
            description="Tripistic connects the work that usually lives in separate tools: bookings, guests, team scheduling, vehicles, waivers, vendors, payments, reporting, and AI."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pillars.map((item, index) => (
              <AnimatedReveal key={item.title} delay={index * 0.04}>
                <div className="h-full rounded-lg border border-border bg-card p-5 shadow-sm">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              </AnimatedReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
          <AnimatedReveal>
            <SectionIntro
              align="left"
              eyebrow="Product preview"
              title="A command center, not another tab."
              description="The v2 front-end is designed around real operating cadence: what is departing today, what needs attention, what AI recommends, and where revenue is moving."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/demo">Interactive demo</ButtonLink>
              <ButtonLink href="/features" variant="secondary">
                Explore features
              </ButtonLink>
            </div>
          </AnimatedReveal>
          <AnimatedReveal delay={0.1}>
            <ProductPreview />
          </AnimatedReveal>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Capabilities"
            title="Everything modern operators expect, built into one platform."
            description="Start with the workflows that matter most today, then expand into AI, white label, customer portals, and enterprise administration as you grow."
          />
          <div className="mt-10">
            <FeatureGrid limit={9} />
          </div>
          <div className="mt-8 text-center">
            <ButtonLink href="/features" variant="secondary">
              View all features
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Who it serves"
            title="Built for operators, agencies, DMCs, and enterprise travel brands."
            description="Tripistic adapts to city tours, private trips, multi-day packages, adventure operators, group travel, educational travel, luxury agencies, and government tourism programs."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["Tour operators", "Run schedules, bookings, guides, waivers, and live operations."],
              ["Travel agencies", "Create AI-assisted itineraries, manage clients, and deliver branded portals."],
              ["Enterprise", "Administer tenants, plans, domains, white labels, AI providers, and platform health."],
            ].map(([title, text]) => (
              <Link key={title} href="/solutions" className="rounded-lg border border-border bg-card p-5 shadow-sm hover:border-accent/40">
                <Building2 className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Trust"
            title="Enterprise foundations with startup speed."
            description="Tenant isolation, RBAC, audit logs, signed Stripe webhooks, immutable versions, and platform admin controls are already part of the v2 architecture."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {trustPillars.map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <ShieldCheck className="size-5 text-accent" aria-hidden />
                <p className="mt-4 text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl rounded-lg border border-border bg-card p-8 shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-accent">Pricing preview</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
                Start lean, grow into a travel platform.
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Solo, Operator, Agency, and Enterprise paths are designed around direct bookings,
                team workflows, AI automation, and branded expansion.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {["Solo", "Operator", "Enterprise"].map((plan) => (
                <Link key={plan} href="/pricing" className="rounded-lg border border-border bg-background p-4 hover:border-accent/40">
                  <p className="font-semibold text-foreground">{plan}</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {plan === "Enterprise" ? "Custom domains, white label, governance." : "Direct booking and operator workflows."}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      </div>
      <FaqSection />
      <CtaBand />
    </MarketingShell>
  );
}
