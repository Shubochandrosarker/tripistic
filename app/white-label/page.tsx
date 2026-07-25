import { Globe2, Mail, Palette, ShieldCheck, Users } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/white-label";
const TITLE = "White Label";
const DESCRIPTION =
  "Apply your brand across the app, customer portal, booking pages, emails, and PDFs, serve from your own domains, and provision multi-tenant sub-workspaces.";

export const metadata = buildMetadata({
  title: "White Label · Agency branding, custom domains, and reseller model",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Brand control",
  keywords: [
    "white label booking software",
    "custom domain booking pages",
    "travel software reseller",
  ],
});

export default function WhiteLabelPage() {
  const items = [
    [Palette, "Agency branding", "Custom brand kits for public booking, login, email, PDF, and API identity."],
    [Globe2, "Custom domains", "DNS verification, SSL state, propagation checks, and hostname ownership records."],
    [Mail, "Custom emails", "Branded sender identity and template direction for confirmations and guest updates."],
    [Users, "Multi tenant", "Workspace-based tenancy designed for operators, agencies, and reseller programs."],
    [ShieldCheck, "Reseller controls", "Super-admin visibility into plans, licenses, domains, brand kits, and health."],
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
            eyebrow="White Label"
            title="Launch travel software under your brand."
            description="Tripistic v2 adds the foundations agencies and enterprise travel brands need: brand kits, custom domains, branded portals, reseller administration, and API identity."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {items.map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand title="Build a branded travel platform without rebuilding the core OS." />
    </MarketingShell>
  );
}
