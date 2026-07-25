import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Lightbulb, TriangleAlert } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, ProductPreview, SectionIntro } from "@/components/marketing/marketing-sections";
import { solutions } from "@/lib/marketing/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return solutions.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) return {};
  return {
    title: `${solution.title} Solution · Tripistic`,
    description: solution.solution,
  };
}

export default async function SolutionPage({ params }: Params) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) notFound();

  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <SectionIntro
              align="left"
              eyebrow={solution.audience}
              title={solution.title}
              description={solution.solution}
            />
            <ProductPreview />
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <TriangleAlert className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Industry challenges</h2>
              <div className="mt-4 space-y-2">
                {solution.challenges.map((item) => (
                  <p key={item} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <Lightbulb className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Tripistic solution</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{solution.solution}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <Check className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Benefits</h2>
              <div className="mt-4 space-y-2">
                {solution.benefits.map((item) => (
                  <p key={item} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{item}</p>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-14 rounded-lg border border-border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Case study snapshot</p>
            <h2 className="mt-3 text-2xl font-semibold text-foreground">From fragmented tools to a unified travel OS.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              A {solution.title.toLowerCase()} team can move bookings, CRM, operations, guide/vehicle planning, guest communication, and reporting into Tripistic while preserving direct customer ownership.
            </p>
          </div>
        </div>
      </main>
      <CtaBand title={`Build a better operating model for ${solution.title.toLowerCase()}.`} />
    </MarketingShell>
  );
}
