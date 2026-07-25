import Link from "next/link";
import { Check, Info } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { COMPARISON_REVIEWED, capabilityComparison, competitors } from "@/lib/marketing/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { faqSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/why-tripistic";
const TITLE = "Why Tripistic";
const DESCRIPTION =
  "Compare Tripistic with Tourflows, Rezdy, FareHarbor, Checkfront, and WeTravel across product scope, AI, operations, CRM, automation, analytics, white label, and pricing.";

export const metadata = buildMetadata({
  title: `${TITLE} · Compared with Tourflows, Rezdy, FareHarbor, Checkfront, WeTravel`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Comparison",
  keywords: [
    "tripistic vs rezdy",
    "tripistic vs fareharbor",
    "tripistic vs checkfront",
    "tripistic vs wetravel",
    "tripistic vs tourflows",
    "best tour operator software",
  ],
});

const REASONS = [
  {
    title: "One record, not five integrations",
    description:
      "Bookings, payments, messages, waivers, and portal activity write to the same customer and departure records. There is no sync to drift and no timeline to reconstruct.",
  },
  {
    title: "Operations is a first-class surface",
    description:
      "Most tools stop at the booking. Tripistic covers the trip day: statuses, delays, incidents, manifests, check-in, staffing, and fleet.",
  },
  {
    title: "AI that reads your data, not just your prompt",
    description:
      "Itinerary drafts from your own catalog and vendors, insights from your own booking history, and search across your own records — with your own provider key.",
  },
  {
    title: "Platform layer for agencies and resellers",
    description:
      "Brand kits, custom domains, sub-workspaces, and provider governance are built in rather than bolted on for enterprise deals.",
  },
];

const COMPARISON_FAQS = [
  [
    "Should I switch if my booking tool works fine?",
    "Probably not, if bookings are your only problem. The case for switching is coordination — staffing, operations, vendors, and reporting — which is where fragmented stacks actually cost money.",
  ],
  [
    "Can I run Tripistic alongside a marketplace?",
    "Yes, and most operators should. Marketplaces supply discovery. Tripistic is where the operation runs and where the customer relationship accumulates for repeat business.",
  ],
  [
    "How hard is migration?",
    "Bookings and payments first, then let the customer record accumulate for a season before decommissioning your CRM spreadsheet. Plan on a season of parallel running, and do not migrate mid-peak.",
  ],
  [
    "What if I need a feature you do not have?",
    "Tell us, and check the public roadmap first. Where a gap is real we will say so on the call rather than after you have migrated.",
  ],
] as const;

export default function WhyTripisticPage() {
  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          faqSchema(COMPARISON_FAQS),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Why Tripistic", href: PATH }]} />
          <SectionIntro
            eyebrow="Why Tripistic"
            title="Built as an operating system, not a booking plug-in."
            description="Most travel tools solve one slice of the business well. Tripistic connects bookings, CRM, operations, workforce, AI, analytics, white label, and enterprise administration in one place."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {REASONS.map((reason) => (
              <div key={reason.title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Check className="size-4.5" aria-hidden />
                </span>
                <h2 className="mt-4 text-lg font-semibold text-foreground">{reason.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{reason.description}</p>
              </div>
            ))}
          </div>

          <section aria-labelledby="matrix-heading" className="mt-16">
            <h2 id="matrix-heading" className="text-2xl font-semibold tracking-tight text-foreground">
              Capability comparison
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Twelve dimensions that determine whether a tool can run an operation or only take a
              booking.
            </p>

            <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
              <table className="w-full min-w-[64rem] text-left text-sm">
                <caption className="sr-only">
                  Tripistic compared with Tourflows, Rezdy, FareHarbor, Checkfront, and WeTravel
                </caption>
                <thead className="bg-muted/70">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Capability
                    </th>
                    <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-accent">
                      Tripistic
                    </th>
                    {competitors.map((name) => (
                      <th
                        key={name}
                        scope="col"
                        className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {capabilityComparison.map((entry) => (
                    <tr key={entry.dimension}>
                      <th scope="row" className="px-4 py-3 align-top font-normal">
                        <span className="block font-medium text-foreground">{entry.dimension}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {entry.detail}
                        </span>
                      </th>
                      <td className="px-4 py-3 align-top">
                        <span className="flex items-start gap-2 font-medium text-accent">
                          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                          {entry.tripistic}
                        </span>
                      </td>
                      {competitors.map((name) => (
                        <td key={name} className="px-4 py-3 align-top text-muted-foreground">
                          {entry.others[name]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                Competitor columns describe category norms based on publicly available product
                information, reviewed {COMPARISON_REVIEWED}. Vendors change their offerings — verify
                current capabilities directly with each vendor before making a decision. All product
                names are trademarks of their respective owners.
              </span>
            </p>
          </section>

          <section aria-labelledby="switching-heading" className="mt-16">
            <h2
              id="switching-heading"
              className="text-2xl font-semibold tracking-tight text-foreground"
            >
              Honest answers about switching
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {COMPARISON_FAQS.map(([question, answer]) => (
                <div key={question} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-foreground">{question}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              More context in{" "}
              <Link
                href="/blog/travel-technology-stack-2026"
                className="font-medium text-accent hover:underline"
              >
                the 2026 travel technology stack
              </Link>{" "}
              and on the{" "}
              <Link href="/pricing" className="font-medium text-accent hover:underline">
                pricing page
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
      <CtaBand title="Choose the platform built for where travel operations are going." />
    </MarketingShell>
  );
}
