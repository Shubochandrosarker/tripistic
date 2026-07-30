import Link from "next/link";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { PricingTable } from "@/components/marketing/pricing-table";
import { RoiCalculator } from "@/components/marketing/roi-calculator";
import { plans, pricingFaqs } from "@/lib/marketing/pricing";
import { buildMetadata } from "@/lib/seo/metadata";
import { faqSchema, productSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/pricing";
const TITLE = "Pricing";
const DESCRIPTION =
  "Tripistic pricing for solo guides, tour operators, agencies, and enterprise travel platforms. Monthly or yearly, 0% commission on direct bookings, full feature comparison and ROI calculator.";

export const metadata = buildMetadata({
  title: `${TITLE} · Plans for operators, agencies, and enterprise`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Pricing",
  keywords: [
    "tour operator software pricing",
    "booking software cost",
    "tripistic pricing",
    "travel operations platform pricing",
    "0% commission booking software",
  ],
});

export default function PricingPage() {
  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          productSchema({
            plans: plans
              .filter((plan) => plan.monthly !== null)
              .map((plan) => ({
                name: plan.name,
                price: String(plan.monthly),
                summary: plan.summary,
              })),
          }),
          faqSchema(pricingFaqs),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Pricing", href: PATH }]} />
          <SectionIntro
            eyebrow="Pricing"
            title="Simple plans for operators. Enterprise power when you need it."
            description="Start with the workflows you need today and grow into itinerary drafting, white label, custom domains, and platform administration. Direct bookings always carry 0% commission."
          />

          <PricingTable />

          <div className="mt-16">
            <RoiCalculator />
          </div>

          <section aria-labelledby="pricing-faq-heading" className="mt-16">
            <h2
              id="pricing-faq-heading"
              className="text-2xl font-semibold tracking-tight text-foreground"
            >
              Pricing questions
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {pricingFaqs.map(([question, answer]) => (
                <div key={question} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-foreground">{question}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              More detail in the{" "}
              <Link href="/legal/refund-policy" className="font-medium text-accent hover:underline">
                Refund Policy
              </Link>
              ,{" "}
              <Link
                href="/legal/service-level-agreement"
                className="font-medium text-accent hover:underline"
              >
                Service Level Agreement
              </Link>
              , and{" "}
              <Link href="/docs/faq" className="font-medium text-accent hover:underline">
                product FAQ
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <CtaBand title="Upgrade from booking software to a travel operating system." />
    </MarketingShell>
  );
}
