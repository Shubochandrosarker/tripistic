import { Cable, Check } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { integrations } from "@/lib/marketing/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/integrations";
const TITLE = "Integrations";
const DESCRIPTION =
  "Connect Tripistic to Stripe, Google Maps, Google Calendar, Twilio, WhatsApp, OpenAI, OpenRouter, Cloudflare, n8n, Zapier, webhooks, and the REST API.";

export const metadata = buildMetadata({
  title: "Integrations · Stripe, Maps, Calendar, Twilio, OpenAI, Zapier, and more",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Ecosystem",
  keywords: [
    "tour operator integrations",
    "stripe booking integration",
    "travel software api integrations",
  ],
});

export default function IntegrationsPage() {
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <SectionIntro
            eyebrow="Integrations"
            title="Connect Tripistic to the tools travel teams already use."
            description="Payments, maps, calendars, messaging, AI providers, automation platforms, webhooks, and APIs are part of the platform direction."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {integrations.map((integration) => (
              <div key={integration} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Cable className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{integration}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Connect {integration} with bookings, operations, CRM, AI, and reporting workflows.
                </p>
                <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-accent">
                  <Check className="size-3.5" aria-hidden /> Integration-ready
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
