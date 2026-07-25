import type { Metadata } from "next";
import { BarChart3, Quote } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Customer Stories · Tripistic",
  description: "Tripistic customer stories, testimonials, ROI, growth metrics, and success stories.",
};

export default function CustomerStoriesPage() {
  const stories = [
    ["City tour operator", "Reduced check-in confusion with manifests, waivers, and operations status in one place.", "18% more direct booking share"],
    ["Private travel agency", "Generated polished multi-day proposals faster with AI itinerary workflows.", "3x faster proposal turnaround"],
    ["Destination management company", "Centralized guides, vehicles, vendors, incidents, and reporting for group operations.", "40 hours saved monthly"],
  ];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="Customer Stories" title="Operators grow when their systems stop fighting them." description="Case-study structures, testimonials, ROI snapshots, growth metrics, and success stories for public proof." />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {stories.map(([title, text, metric]) => (
              <div key={title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Quote className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  <BarChart3 className="size-3.5" aria-hidden /> {metric}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
