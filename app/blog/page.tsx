import type { Metadata } from "next";
import { Newspaper } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Blog · Tripistic",
  description: "Tripistic blog for travel technology, AI, automation, growth, marketing, operations, product updates, case studies, and industry news.",
};

const categories = ["Travel Technology", "AI", "Automation", "Growth", "Marketing", "Operations", "Product Updates", "Case Studies", "Industry News"];

export default function BlogPage() {
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro eyebrow="Blog" title="Ideas for the next generation of travel operations." description="SEO-ready editorial categories for operators modernizing sales, guest experience, AI, automation, marketing, and operations." />
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {categories.map((category, index) => (
              <article key={category} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Newspaper className="size-5 text-accent" aria-hidden />
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</p>
                <h2 className="mt-2 text-xl font-semibold text-foreground">
                  {index % 2 === 0 ? "How AI changes the tour operator back office" : "The direct-booking playbook for modern travel brands"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Editorial hub content prepared for publishing and SEO expansion.</p>
              </article>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
