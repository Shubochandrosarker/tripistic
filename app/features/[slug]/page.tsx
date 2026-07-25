import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Monitor, Sparkles } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, ProductPreview, SectionIntro, featureIcons } from "@/components/marketing/marketing-sections";
import { featureList } from "@/lib/marketing/content";

type Params = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return featureList.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const feature = featureList.find((item) => item.slug === slug);
  if (!feature) return {};
  return {
    title: `${feature.title} · Tripistic Features`,
    description: feature.summary,
  };
}

export default async function FeatureDetailPage({ params }: Params) {
  const { slug } = await params;
  const feature = featureList.find((item) => item.slug === slug);
  if (!feature) notFound();
  const Icon = featureIcons[feature.slug] ?? Sparkles;

  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <span className="flex size-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="size-6" aria-hidden />
              </span>
              <SectionIntro align="left" eyebrow={feature.eyebrow} title={feature.title} description={feature.summary} />
            </div>
            <ProductPreview />
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm lg:col-span-2">
              <Monitor className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">What teams get</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {feature.benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                    <Check className="mt-0.5 size-4 text-accent" aria-hidden />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <Sparkles className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Related features</h2>
              <div className="mt-4 space-y-2">
                {feature.related.map((item) => (
                  <p key={item} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <CtaBand title={`Bring ${feature.title.toLowerCase()} into your travel OS.`} />
    </MarketingShell>
  );
}
