import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarCheck,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  FileText,
  Globe2,
  Handshake,
  Headphones,
  Map,
  Palette,
  Radio,
  Search,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { featureList, platformStats } from "@/lib/marketing/content";
import { AnimatedReveal } from "@/components/marketing/animated-reveal";

export const featureIcons: Record<string, typeof Sparkles> = {
  bookings: CalendarCheck,
  crm: Users,
  ai: Bot,
  tours: Map,
  guides: ClipboardList,
  drivers: Radio,
  vehicles: Radio,
  operations: Radio,
  marketing: Sparkles,
  reports: FileText,
  "white-label": Palette,
  "custom-domains": Globe2,
  "customer-portal": Headphones,
  payments: CreditCard,
  automation: Zap,
  analytics: BarChart3,
  integrations: Handshake,
};

export function SectionIntro({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  description: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      {eyebrow ? (
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
      ) : null}
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{description}</p>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        className="absolute inset-0 -z-10 bg-cover bg-center"
        style={{ backgroundImage: "url('/marketing/tripistic-hero-ops.png')" }}
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,8,10,.94),rgba(5,8,10,.75)_42%,rgba(5,8,10,.16)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-28 bg-gradient-to-t from-background to-transparent" />
      <div className="mx-auto flex min-h-[760px] max-w-7xl items-center px-4 py-24 sm:px-6">
        <AnimatedReveal className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur">
            <Sparkles className="size-3.5 text-emerald-300" aria-hidden />
            Tripistic v2.0.0 · AI Travel Operating System
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight text-white sm:text-7xl">
            The modern AI OS for tour operators.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">
            Replace booking tabs, spreadsheets, guide chats, waiver folders, payment
            chasing, and disconnected CRM tools with one premium operating system built
            for travel businesses.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register" size="lg" className="bg-white text-zinc-950 hover:bg-white/90">
              Start free trial <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/demo" variant="secondary" size="lg" className="border-white/20 bg-white/10 text-white hover:bg-white/15">
              Watch product demo
            </ButtonLink>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {platformStats.map((stat) => (
              <div key={stat.label} className="rounded-lg border border-white/12 bg-white/8 p-3 backdrop-blur">
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
                <p className="mt-1 text-xs text-white/65">{stat.label}</p>
              </div>
            ))}
          </div>
        </AnimatedReveal>
      </div>
    </section>
  );
}

export function ProductPreview() {
  const lanes = [
    ["Today", "8 departures", "92 guests", "3 alerts"],
    ["AI", "Itinerary ready", "Pricing idea", "Guide match"],
    ["Revenue", "$42.8k MTD", "19% direct", "4 pending"],
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Operations Command
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">Departures, AI, revenue</h2>
            </div>
            <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
              Live
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {lanes.map((lane) => (
              <div key={lane[0]} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium text-foreground">{lane[0]}</p>
                {lane.slice(1).map((item) => (
                  <p key={item} className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-5 h-32 rounded-lg border border-border bg-[linear-gradient(135deg,var(--muted),var(--card))] p-4">
            <div className="flex h-full items-end gap-2">
              {[35, 64, 42, 80, 58, 92, 70, 86].map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t bg-accent/75"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          {["AI itinerary generated", "Guide assigned", "Payment webhook verified", "Waiver completed"].map((item, index) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border border-border bg-background p-4">
              <span className="mt-0.5 flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Check className="size-4" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{item}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {["Proposal saved as v4", "Best match from skills and availability", "Seats confirmed after Stripe event", "Participant document attached"][index]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FeatureGrid({ limit }: { limit?: number }) {
  const items = typeof limit === "number" ? featureList.slice(0, limit) : featureList;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((feature, index) => {
        const Icon = featureIcons[feature.slug] ?? Sparkles;
        return (
          <AnimatedReveal key={feature.slug} delay={Math.min(index * 0.03, 0.18)}>
            <Link
              href={`/features/${feature.slug}`}
              className="group block h-full rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="size-5" aria-hidden />
              </span>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {feature.eyebrow}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.summary}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                Explore <ChevronRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          </AnimatedReveal>
        );
      })}
    </div>
  );
}

export function CtaBand({
  title = "Turn your travel business into an AI-native operation.",
  description = "Launch direct bookings, operations, CRM, AI itineraries, and enterprise controls from one modern platform.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-7xl rounded-lg border border-border bg-card p-8 shadow-sm sm:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/register" size="lg">
              Start free <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Contact sales
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FaqSection() {
  const faqs = [
    ["Is Tripistic only for tour operators?", "No. It supports operators, travel agencies, DMCs, private-tour teams, education travel, and enterprise travel brands."],
    ["Does Tripistic replace my booking tool?", "Tripistic includes direct booking, availability, payments, waivers, operations, CRM, and AI workflows in one system."],
    ["Can agencies white-label the platform?", "Yes. v2 includes the enterprise data model and admin surfaces for brand kits, custom domains, API branding, and reseller-ready operations."],
    ["Does it support AI itineraries?", "Yes. The itinerary builder creates editable multi-day proposals from tours, vendors, and trip context, then tracks versions."],
  ];
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <SectionIntro eyebrow="FAQ" title="Questions operators ask before switching" description="Clear answers for teams moving from fragmented tools to a real travel operating system." />
        <div className="mt-10 divide-y divide-border rounded-lg border border-border bg-card">
          {faqs.map(([question, answer]) => (
            <div key={question} className="p-5">
              <h2 className="text-base font-semibold text-foreground">{question}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SearchPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
        <Search className="size-4" aria-hidden />
        Search docs, bookings, customers, itineraries...
      </div>
      <div className="mt-4 grid gap-2">
        {["Create a direct booking page", "Connect Stripe payments", "Generate a multi-day itinerary", "Verify a custom domain"].map((item) => (
          <div key={item} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="text-foreground">{item}</span>
            <Clock3 className="size-4 text-muted-foreground" aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}
