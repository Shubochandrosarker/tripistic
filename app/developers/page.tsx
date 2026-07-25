import type { Metadata } from "next";
import { Code2, KeyRound, Lock, RadioTower, ScrollText, Shield } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";

export const metadata: Metadata = {
  title: "API · Tripistic Developers",
  description: "Tripistic developer landing page for authentication, REST APIs, webhooks, SDKs, examples, rate limits, and OpenAPI.",
};

export default function DevelopersPage() {
  const items = [
    [KeyRound, "Authentication", "JWT/session-aware app APIs and future public API key scopes."],
    [Code2, "REST", "Tenant-scoped route patterns for bookings, tours, CRM, operations, vendors, and itineraries."],
    [RadioTower, "Webhooks", "Payment, booking, domain, and automation event contracts."],
    [ScrollText, "SDK examples", "Typed examples for common operator and reseller workflows."],
    [Shield, "Rate limits", "Production guidance for WAF/CDN rate limits and API quotas."],
    [Lock, "OpenAPI", "OpenAPI publishing target for partner and reseller integrations."],
  ];
  return (
    <MarketingShell>
      <main className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <SectionIntro
            eyebrow="API"
            title="Developer tools for travel platforms and integrations."
            description="Tripistic exposes the operating model behind travel businesses: bookings, customers, itineraries, payments, operations, domains, and automation."
          />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      <CtaBand title="Build on top of the travel operating system." />
    </MarketingShell>
  );
}
