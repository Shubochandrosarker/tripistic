import type { Metadata } from "next";
import { Handshake } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "Partners · Tripistic",
  description: "Tripistic partner programs for technology partners, integration partners, travel partners, agency partners, and affiliates.",
};

export default function PartnersPage() {
  const partners = ["Technology Partners", "Integration Partners", "Travel Partners", "Agency Partners", "Affiliate Program"];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
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
