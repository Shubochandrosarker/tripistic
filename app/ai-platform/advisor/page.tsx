import { Sparkles } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { TravelAdvisor } from "@/components/ai/travel-advisor";
import { EmptyState } from "@/components/ui/empty-state";
import { isChatAvailable } from "@/lib/ai/providers";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/ai-platform/advisor";
const TITLE = "Tripistic Travel Advisor";
const DESCRIPTION =
  "Plan a trip and find real guided experiences from Tripistic operators, or ask how to run your own tours on Tripistic.";

export const metadata = buildMetadata({
  title: "Travel Advisor · Plan a trip or start running tours",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Travel Advisor",
  keywords: ["travel planning assistant", "guided tour search", "itinerary planner", "tour operator software"],
});

export default function TravelAdvisorPage() {
  return (
    <MarketingShell>
      <JsonLd schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]} />
      <main id="main" className="px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <Breadcrumbs
            items={[
              { name: "Automation & Insights", href: "/ai-platform" },
              { name: "Travel Advisor", href: PATH },
            ]}
          />
          <div className="mb-6 max-w-2xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Tell it where you are going, or what you want to run.
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Tour results come from operators publishing on Tripistic — real availability and real
              prices, looked up while you chat. Nothing about a trip is invented: if the advisor does
              not know, it says so.
            </p>
          </div>

          {isChatAvailable() ? (
            <TravelAdvisor />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="The advisor is offline right now"
              description="No model provider is configured for this deployment, so the advisor cannot answer. Browse the tours and product pages in the meantime."
            />
          )}
        </div>
      </main>
    </MarketingShell>
  );
}
