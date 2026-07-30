import { Rocket } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/changelog";
const TITLE = "Changelog";
const DESCRIPTION =
  "Version history and release notes for the Tripistic travel operations platform.";

export const metadata = buildMetadata({
  title: "Changelog · What shipped and when",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Product",
  keywords: [
    "tripistic changelog",
    "travel software release notes",
    "product updates",
  ],
});

export default function ChangelogPage() {
  const releases = [
    ["v2.0.0", "Enterprise foundation", "Theme engine, command palette, super admin, white label, custom domains, AI providers, docs."],
    ["Phase 12", "Growth Insights", "Health score, pricing suggestions, risk alerts, and marketing recommendations — computed from your own data."],
    ["Phase 11", "AI Itinerary Builder", "Multi-day itineraries, vendors, source items, versions, and public share links."],
    ["Phase 8-10", "Operations, Fleet, Vendors", "Live operations center, incidents, vehicles, maintenance, vendors, and invoices."],
  ];
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <SectionIntro eyebrow="Changelog" title="A public record of the platform becoming a travel OS." description="Version history, release notes, roadmap direction, and upcoming features for teams evaluating Tripistic." />
          <div className="mt-12 space-y-4">
            {releases.map(([version, title, text]) => (
              <div key={version} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Rocket className="size-5 text-accent" aria-hidden />
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{version}</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{title}</h2>
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
