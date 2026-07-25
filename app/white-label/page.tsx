import type { Metadata } from "next";
import { Globe2, Mail, Palette, ShieldCheck, Users } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "White Label · Tripistic",
  description: "White-label Tripistic for agencies, DMCs, resellers, and enterprise travel brands with custom domains, logo, emails, portals, API branding, and multi-tenant administration.",
};

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
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
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
