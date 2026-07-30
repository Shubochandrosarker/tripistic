import { CalendarClock } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { GradientBackdrop } from "@/components/marketing/motion";
import { ProductTour } from "@/components/marketing/product-tour";
import { ButtonLink } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo/metadata";
import { faqSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/demo";
const TITLE = "Product Demo";
const DESCRIPTION =
  "Explore Tripistic hands-on — an interactive walkthrough of operations, bookings, and CRM, plus a live demo with our team.";

export const metadata = buildMetadata({
  title: `${TITLE} · Interactive product walkthrough`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Demo",
  keywords: [
    "tripistic demo",
    "tour operator software demo",
    "booking software walkthrough",
    "travel operations demo",
  ],
});

const DEMO_FAQS = [
  [
    "How long is a live demo?",
    "Thirty minutes. We walk your actual workflows rather than a scripted tour, and you leave with a written summary of whether it fits.",
  ],
  [
    "Do I need to book a demo to try it?",
    "No. Trials are fully functional and require no card. The demo is useful if you want migration or multi-tenant questions answered first.",
  ],
  [
    "Can you show a migration from our current tool?",
    "Yes. Bring a sample export and we will walk through how the records map, including the parts that are genuinely awkward.",
  ],
  [
    "Is the interactive walkthrough real product data?",
    "The walkthrough uses representative sample data. The interface, workflows, and terminology are the real product.",
  ],
] as const;

export default function DemoPage() {
  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          faqSchema(DEMO_FAQS),
        ]}
      />
      <main id="main" className="relative px-4 py-16 sm:px-6">
        <GradientBackdrop />
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Demo", href: PATH }]} />
          <SectionIntro
            eyebrow="Interactive demo"
            title="See the operating system, not a slide deck."
            description="Explore the product yourself, watch a guided walkthrough, or book thirty minutes with someone who will answer the awkward questions."
          />

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/register" size="lg">
              Start free trial
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              <CalendarClock className="size-4" aria-hidden /> Book a live demo
            </ButtonLink>
          </div>

          <section aria-labelledby="tour-heading" className="mt-16">
            <h2 id="tour-heading" className="sr-only">
              Interactive product walkthrough
            </h2>
            <ProductTour />
          </section>


          <section aria-labelledby="live-demo-heading" className="mt-16">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
                <div>
                  <h2
                    id="live-demo-heading"
                    className="text-2xl font-semibold tracking-tight text-foreground"
                  >
                    Book a live demo
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    Thirty minutes, walked against your actual workflows. Useful if you are
                    evaluating a migration, running multiple brands, or need procurement questions
                    answered.
                  </p>
                  <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                    {[
                      "We map your current tools to the platform, honestly including the gaps",
                      "We run your hardest operational case, not our easiest one",
                      "You get a written summary and a migration outline afterwards",
                      "No obligation, and no pressure to decide on the call",
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-border bg-background p-5">
                  <p className="text-sm font-medium text-foreground">What to bring</p>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    <li>Your tour catalog, or a sample of it</li>
                    <li>A typical week of departures</li>
                    <li>The workflow that currently costs you most time</li>
                    <li>Any compliance or procurement requirements</li>
                  </ul>
                  <ButtonLink href="/contact" className="mt-5 w-full">
                    Request a demo
                  </ButtonLink>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="demo-faq-heading" className="mt-16">
            <h2
              id="demo-faq-heading"
              className="text-2xl font-semibold tracking-tight text-foreground"
            >
              Demo questions
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {DEMO_FAQS.map(([question, answer]) => (
                <div key={question} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-foreground">{question}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
