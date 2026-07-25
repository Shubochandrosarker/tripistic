import type { Metadata } from "next";
import { Compass, Flag, HeartHandshake, Telescope } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "About · Tripistic",
  description: "Tripistic mission, vision, story, leadership, values, and timeline.",
};

export default function AboutPage() {
  const values = [
    [Compass, "Mission", "Make world-class travel operations software accessible to operators of every size."],
    [Telescope, "Vision", "Every trip business runs on an intelligent, branded, connected operating system."],
    [HeartHandshake, "Values", "Operator empathy, product craft, pragmatic AI, trust, speed, and clear ownership."],
    [Flag, "Timeline", "From booking foundation to v2 enterprise platform, Tripistic is growing into a full travel OS."],
  ];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="About" title="Tripistic exists because travel operators deserve better software." description="The product brings together bookings, teams, guests, suppliers, operations, and AI into one elegant system." />
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {values.map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
