import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, FeatureGrid, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/features";
const TITLE = "Features";
const DESCRIPTION =
  "All 17 Tripistic capabilities — bookings, CRM, AI, tours, guides, drivers, vehicles, operations, marketing, reports, white label, custom domains, customer portal, payments, automation, analytics, and integrations.";

export const metadata = buildMetadata({
  title: "Features · Everything modern travel operations need",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Platform",
  keywords: [
    "tour operator software features",
    "travel booking platform features",
    "tripistic features",
  ],
});

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <SectionIntro
            eyebrow="Features"
            title="A complete AI-native operating system for travel teams."
            description="Every feature is designed to remove a disconnected tool, reduce manual work, or help operators make better decisions from their own data."
          />
          <div className="mt-12">
            <FeatureGrid />
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
