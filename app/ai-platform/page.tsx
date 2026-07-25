import type { Metadata } from "next";
import { Bot, Brain, FileText, Search, Sparkles, Wand2, Zap } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, ProductPreview, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "AI Platform · Tripistic",
  description: "Tripistic AI Copilot, AI Search, AI Scheduling, AI Reports, AI Itinerary Builder, AI Business Insights, Knowledge Base, and Automation.",
};

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
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
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
