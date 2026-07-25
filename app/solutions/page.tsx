import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { solutions } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Solutions · Tripistic",
  description: "Tripistic solutions for tour operators, agencies, DMCs, adventure tours, city tours, private tours, multi-day tours, luxury travel, group travel, education, government tourism, and enterprise.",
};

export default function SolutionsPage() {
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="Solutions"
            title="One platform, shaped for every travel business model."
            description="Tripistic adapts to high-volume city tours, bespoke private travel, DMC operations, multi-day packages, public tourism programs, and enterprise reseller platforms."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {solutions.map((solution) => (
              <Link
                key={solution.slug}
                href={`/solutions/${solution.slug}`}
                className="group rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40"
              >
                <Building2 className="size-5 text-accent" aria-hidden />
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {solution.audience}
                </p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{solution.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{solution.solution}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                  View solution <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
