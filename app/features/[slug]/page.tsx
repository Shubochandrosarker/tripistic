import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Monitor, Sparkles } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro, featureIcons } from "@/components/marketing/marketing-sections";
import { ScreenshotFrame } from "@/components/marketing/screenshot-frame";
import { ButtonLink } from "@/components/ui/button";
import { featureList, screenshotFor } from "@/lib/marketing/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return featureList.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const feature = featureList.find((item) => item.slug === slug);
  if (!feature) {
    return buildMetadata({
      title: "Not found",
      description: "",
      path: `/features/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${feature.title} · Tripistic Features`,
    description: feature.summary,
    path: `/features/${feature.slug}`,
    eyebrow: feature.eyebrow,
    keywords: [
      `tour operator ${feature.title.toLowerCase()} software`,
      `travel ${feature.title.toLowerCase()} platform`,
      `tripistic ${feature.title.toLowerCase()}`,
    ],
  });
}

/** Deep links from a feature's related list into the matching feature pages. */
function relatedFeature(title: string) {
  return featureList.find((item) => item.title.toLowerCase() === title.toLowerCase()) ?? null;
}

export default async function FeatureDetailPage({ params }: Params) {
  const { slug } = await params;
  const feature = featureList.find((item) => item.slug === slug);
  if (!feature) notFound();

  const Icon = featureIcons[feature.slug] ?? Sparkles;
  const screenshot = screenshotFor(feature.slug);
  const path = `/features/${feature.slug}`;

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: feature.title, description: feature.summary, path }),
          itemListSchema({
            name: `${feature.title} capabilities`,
            items: feature.benefits.map((benefit) => ({ name: benefit, href: path })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs
            items={[
              { name: "Features", href: "/features" },
              { name: feature.title, href: path },
            ]}
          />

          <div className="grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
            <div>
              <span className="flex size-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="size-6" aria-hidden />
              </span>
              <SectionIntro
                align="left"
                eyebrow={feature.eyebrow}
                title={feature.title}
                description={feature.summary}
              />
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/register">Start free</ButtonLink>
                <ButtonLink href="/demo" variant="secondary">
                  See it in the demo
                </ButtonLink>
              </div>
            </div>
            <ScreenshotFrame screenshot={screenshot} />
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm lg:col-span-2">
              <Monitor className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">What teams get</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {feature.benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                    <span className="text-sm text-foreground">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <Sparkles className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Related features</h2>
              <div className="mt-4 space-y-2">
                {feature.related.map((item) => {
                  const target = relatedFeature(item);
                  const className =
                    "block rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground";
                  return target ? (
                    <Link key={item} href={`/features/${target.slug}`} className={className}>
                      {item}
                    </Link>
                  ) : (
                    <span key={item} className={className}>
                      {item}
                    </span>
                  );
                })}
              </div>
              <Link
                href="/features"
                className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
              >
                All features →
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Go deeper</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Documentation covers how this works in practice, including the edge cases that matter
              once you are running real departures.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link href="/docs" className="font-medium text-accent hover:underline">
                Documentation →
              </Link>
              <Link href="/pricing" className="font-medium text-accent hover:underline">
                Which plan includes it →
              </Link>
              <Link href="/why-tripistic" className="font-medium text-accent hover:underline">
                Compare with other tools →
              </Link>
            </div>
          </div>
        </div>
      </main>
      <CtaBand title={`Bring ${feature.title.toLowerCase()} into your travel OS.`} />
    </MarketingShell>
  );
}
