import type { Metadata } from "next";
import { BookOpen, Video } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SearchPanel, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Documentation · Tripistic",
  description: "Tripistic public documentation for getting started, bookings, CRM, tours, payments, users, permissions, integrations, API, FAQ, videos, and release notes.",
};

export default function DocsPage() {
  const sections = ["Getting Started", "Bookings", "CRM", "Tours", "Payments", "Users", "Permissions", "Integrations", "API", "FAQ", "Videos", "Release Notes"];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div>
            <SectionIntro
              align="left"
              eyebrow="Documentation"
              title="Learn Tripistic from setup to scale."
              description="Public documentation for operators, admins, partners, and developers adopting the platform."
            />
            <div className="mt-8">
              <SearchPanel />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <div key={section} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                {section === "Videos" ? <Video className="size-5 text-accent" aria-hidden /> : <BookOpen className="size-5 text-accent" aria-hidden />}
                <h2 className="mt-4 text-lg font-semibold text-foreground">{section}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Guides, examples, and operational best practices for {section.toLowerCase()}.</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
