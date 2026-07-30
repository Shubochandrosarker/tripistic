import { Route } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/customers";
const TITLE = "Who Tripistic is for";
// Phase 10. This page presented three invented case studies with specific
// quantified results — "18% more direct booking share", "3x faster proposal
// turnaround", "40 hours saved monthly" — for a product that has no customers
// yet. Phase 1 removed fabricated testimonials from the homepage on FTC
// endorsement grounds; these are the same thing with numbers attached, and the
// guard never scanned this file. Replaced with what the product actually does
// for each operator type, which needs no invented proof.
const DESCRIPTION =
  "What Tripistic does for tour operators, agencies, and DMCs — the workflows each one runs on it.";

export const metadata = buildMetadata({
  title: "Who Tripistic is for · Operators, agencies, and DMCs",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Use cases",
  keywords: [
    "tour operator software",
    "travel agency operations",
    "dmc operations software",
  ],
});

export default function AudiencePage() {
  // Capabilities, not outcomes. Every claim here is checkable against the
  // product; none of it asserts a result nobody has measured.
  const audiences: [string, string][] = [
    [
      "City tour operators",
      "Manifests, digital waivers, and live departure status in one place, so check-in does not depend on a spreadsheet and a phone.",
    ],
    [
      "Private travel agencies",
      "Build multi-day itineraries from your own tours, version them, and share a proposal your client can read on any device.",
    ],
    [
      "Destination management companies",
      "Guides, vehicles, vendors, incidents, and reporting for group operations, scoped per workspace.",
    ],
  ];
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <SectionIntro
            eyebrow="Use cases"
            title="Operators grow when their systems stop fighting them."
            description="Tripistic is pre-launch, so there are no customer results to report yet. Here is what the product does for each kind of operator instead."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {audiences.map(([title, text]) => (
              <div key={title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Route className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-xl font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
