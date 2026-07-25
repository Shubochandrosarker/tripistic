import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Lightbulb, Quote, TriangleAlert } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { Counter } from "@/components/marketing/motion";
import { ScreenshotFrame } from "@/components/marketing/screenshot-frame";
import { ButtonLink } from "@/components/ui/button";
import { caseStudyFor, screenshotFor, solutions } from "@/lib/marketing/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return solutions.map((solution) => ({ slug: solution.slug }));
}

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) {
    return buildMetadata({
      title: "Not found",
      description: "",
      path: `/solutions/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${solution.title} · Tripistic Solutions`,
    description: solution.solution,
    path: `/solutions/${solution.slug}`,
    eyebrow: solution.audience,
    keywords: [
      `${solution.title.toLowerCase()} software`,
      `${solution.title.toLowerCase()} booking system`,
      `travel operations for ${solution.title.toLowerCase()}`,
    ],
  });
}

export default async function SolutionPage({ params }: Params) {
  const { slug } = await params;
  const solution = solutions.find((item) => item.slug === slug);
  if (!solution) notFound();

  const study = caseStudyFor(solution.slug);
  const path = `/solutions/${solution.slug}`;
  const others = solutions.filter((item) => item.slug !== solution.slug).slice(0, 6);

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: solution.title, description: solution.solution, path }),
          itemListSchema({
            name: `${solution.title} benefits`,
            items: solution.benefits.map((benefit) => ({ name: benefit, href: path })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs
            items={[
              { name: "Solutions", href: "/solutions" },
              { name: solution.title, href: path },
            ]}
          />

          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <SectionIntro
                align="left"
                eyebrow={solution.audience}
                title={solution.title}
                description={solution.solution}
              />
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/register">Start free</ButtonLink>
                <ButtonLink href="/contact" variant="secondary">
                  Talk to sales
                </ButtonLink>
              </div>
            </div>
            <ScreenshotFrame screenshot={screenshotFor(solution.slug)} />
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <TriangleAlert className="size-5 text-accent" aria-hidden />
              <h2 className="mt-4 text-xl font-semibold text-foreground">Industry challenges</h2>
              <div className="mt-4 space-y-2">
                {solution.challenges.map((item) => (
                  <p key={item} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </p>
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
                  <p key={item} className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <section
            aria-labelledby="case-study-heading"
            className="mt-14 rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Case study</p>
            <h2
              id="case-study-heading"
              className="mt-3 text-2xl font-semibold tracking-tight text-foreground"
            >
              {study.operator}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{study.profile}</p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">The challenge</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{study.challenge}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">What they did</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{study.approach}</p>
              </div>
            </div>

            <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {study.metrics.map((metric) => (
                <div key={metric.label} className="rounded-lg border border-border bg-background p-4">
                  <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                  <dd className="mt-1.5 text-lg font-semibold text-foreground">{metric.value}</dd>
                </div>
              ))}
            </dl>

            <blockquote className="mt-8 rounded-lg border-l-2 border-accent bg-background p-5">
              <Quote className="size-5 text-accent" aria-hidden />
              <p className="mt-3 text-base leading-7 text-foreground">“{study.quote}”</p>
              <footer className="mt-3 text-sm text-muted-foreground">— {study.attribution}</footer>
            </blockquote>

            <p className="mt-6 text-xs leading-5 text-muted-foreground">
              This case study is a composite drawn from patterns across operators of this type rather
              than a single named customer. Figures are representative of the range operators report,
              not a guarantee of results.
            </p>
          </section>

          <section aria-labelledby="stats-heading" className="mt-14">
            <h2 id="stats-heading" className="sr-only">
              Platform commitments
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { value: 0, suffix: "%", label: "commission on direct bookings" },
                { value: 17, suffix: "", label: "capabilities in one platform" },
                { value: 30, suffix: " days", label: "data export window after cancellation" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-border bg-card p-5 text-center shadow-sm"
                >
                  <p className="text-3xl font-semibold text-foreground">
                    <Counter value={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="other-solutions-heading" className="mt-14">
            <h2
              id="other-solutions-heading"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Other solutions
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {others.map((item) => (
                <Link
                  key={item.slug}
                  href={`/solutions/${item.slug}`}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                >
                  {item.title}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <CtaBand title={`Build a better operating model for ${solution.title.toLowerCase()}.`} />
    </MarketingShell>
  );
}
