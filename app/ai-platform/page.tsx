import { Bot, Brain, FileText, Search, Sparkles, Wand2, Zap } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, ProductPreview, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/ai-platform";
const TITLE = "AI Platform";
const DESCRIPTION =
  "Tripistic AI copilot, AI search, AI scheduling, AI reports, AI itinerary builder, business insights, knowledge base, and automation — reading your own operational data.";

export const metadata = buildMetadata({
  title: "AI Platform · Copilot, search, scheduling, itineraries, and insights",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "AI",
  keywords: [
    "ai for tour operators",
    "ai itinerary builder",
    "travel ai platform",
    "ai travel operations",
  ],
});

export default function AiPlatformPage() {
  const items = [
    [Bot, "AI Copilot", "Ask for next actions, operational summaries, and revenue ideas from the context of your own workspace."],
    [Search, "AI Search", "Find bookings, customers, itineraries, and operational records through command palette search."],
    [Wand2, "AI Scheduling", "Match guides, drivers, vehicles, skills, capacity, and time off for better assignments."],
    [FileText, "AI Reports", "Summarize revenue, demand, risk, and operations into executive-ready reports."],
    [Sparkles, "AI Itinerary Builder", "Generate editable multi-day proposals from tours, vendors, and trip constraints."],
    [Brain, "Business Insights", "Turn historical bookings and CRM activity into pricing suggestions and growth ideas."],
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
              eyebrow="AI Platform"
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
