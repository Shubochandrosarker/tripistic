import { Brain, Search, Sparkles, Wand2, Zap } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, ProductPreview, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/ai-platform";
const TITLE = "Automation & Insights";
const DESCRIPTION =
  "Automated business insights, workspace search, assignment matching, itinerary drafting, and operational automation — computed from your own data, with the method shown.";

export const metadata = buildMetadata({
  title: "Automation & Insights · Search, scheduling, itineraries, and business analysis",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Automation",
  keywords: [
    "tour operator automation",
    "itinerary builder",
    "tour operator analytics",
    "travel operations software",
  ],
});

export default function AiPlatformPage() {
  // Every entry below is backed by shipped code. Two former entries — "AI
  // Copilot" and "AI Reports" — were removed rather than reworded, because no
  // implementation of either exists. The remaining features are deterministic:
  // they compute results from your data rather than calling a language model,
  // which is why the numbers are reproducible and never invented.
  const items = [
    [Search, "Workspace search", "Find bookings, customers, itineraries, and operational records from the command palette."],
    [Wand2, "Assignment matching", "Score guides, drivers, and vehicles against skills, capacity, and time off to suggest the best fit for a departure."],
    [Sparkles, "Itinerary builder", "Draft editable multi-day proposals from your own tours, vendors, and trip constraints."],
    [Brain, "Business Brain", "Turn historical bookings and CRM activity into occupancy, pricing, and growth recommendations — each shown with the figures behind it."],
    [Zap, "Automation", "Trigger reminders, review requests, payment sweeps, and departure updates."],
  ];
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <SectionIntro
              align="left"
              eyebrow="Automation & Insights"
              title="AI that understands the travel operation behind the trip."
              description="Tripistic AI is designed around operational context: bookings, customers, availability, guides, vehicles, vendors, payments, itineraries, and growth signals."
            />
            <ProductPreview />
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand title="Put AI inside your operating system, not outside it." />
    </MarketingShell>
  );
}
