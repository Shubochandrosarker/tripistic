import type { Metadata } from "next";
import { BriefcaseBusiness, Globe2, Heart } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Careers · Tripistic",
  description: "Tripistic careers, company culture, open positions, benefits, and remote work.",
};

export default function CareersPage() {
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="Careers" title="Build the AI operating system for travel." description="Tripistic is for people who care about elegant software, real operators, travel businesses, and practical AI." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              [Heart, "Culture", "High-agency, customer-close, product-minded, and calm under operational complexity."],
              [Globe2, "Remote work", "Built for distributed teams with strong writing, ownership, and craft."],
              [BriefcaseBusiness, "Open positions", "Product engineering, design, growth, partnerships, support, and customer success."],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand title="Help build the product travel operators wish existed." />
    </MarketingShell>
  );
}
