import type { Metadata } from "next";
import { CheckCircle2, Clock, Vote } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Roadmap · Tripistic",
  description: "Tripistic public roadmap with planned, in progress, released, and voting sections.",
};

export default function RoadmapPage() {
  const columns = [
    ["Released", CheckCircle2, ["Booking engine", "Stripe payments", "CRM timeline", "Operations center", "AI itinerary builder", "Super admin foundation"]],
    ["In Progress", Clock, ["White-label renderer", "Custom-domain resolver", "Maintenance middleware", "Accessibility test suite"]],
    ["Voting", Vote, ["Native mobile app", "Marketplace channel sync", "Advanced yield management", "Partner portal"]],
  ] as const;
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="Roadmap" title="Transparent product direction for travel operators." description="Track what is released, in progress, planned, and open for customer feedback." />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {columns.map(([title, Icon, items]) => (
              <div key={title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
                <div className="mt-4 space-y-2">
                  {items.map((item) => (
                    <p key={item} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{item}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
