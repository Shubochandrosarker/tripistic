import { Handshake } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/partners";
const TITLE = "Partners";
const DESCRIPTION =
  "Partner with Tripistic — technology partners, integration partners, travel partners, agency partners, and the affiliate program.";

export const metadata = buildMetadata({
  title: "Partners · Technology, integration, agency, and affiliate programs",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Partners",
  keywords: [
    "travel software partners",
    "tour operator reseller",
    "tripistic affiliate program",
  ],
});

export default function PartnersPage() {
  const partners = ["Technology Partners", "Integration Partners", "Travel Partners", "Agency Partners", "Affiliate Program"];
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <SectionIntro eyebrow="Partners" title="A partner ecosystem for modern travel operations." description="Tripistic is built to support integration partners, agencies, travel partners, affiliates, and technology ecosystems." />
          <div className="mt-12 grid gap-4 md:grid-cols-5">
            {partners.map((partner) => (
              <div key={partner} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Handshake className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{partner}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Collaborate with Tripistic to help operators modernize travel workflows.</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand title="Partner with the operating system for travel businesses." />
    </MarketingShell>
  );
}
