import { Compass, Flag, HeartHandshake, Telescope } from "lucide-react";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { buildMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/schema";

const PATH = "/about";
const TITLE = "About";
const DESCRIPTION =
  "Tripistic exists to give tour operators, agencies, and DMCs software worth running a business on. Our mission, vision, story, values, and timeline.";

export const metadata = buildMetadata({
  title: "About · Our mission, story, and values",
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Company",
  keywords: [
    "about tripistic",
    "travel technology company",
    "tour operator software company",
  ],
});

export default function AboutPage() {
  const values = [
    [Compass, "Mission", "Make world-class travel operations software accessible to operators of every size."],
    [Telescope, "Vision", "Every trip business runs on an intelligent, branded, connected operating system."],
    [HeartHandshake, "Values", "Operator empathy, product craft, pragmatic AI, trust, speed, and clear ownership."],
    [Flag, "Timeline", "From booking foundation to v2 enterprise platform, Tripistic is growing into a full travel OS."],
  ];
  return (
    <MarketingShell>
      <JsonLd
        schema={[webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH })]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: TITLE, href: PATH }]} />
          <SectionIntro eyebrow="About" title="Tripistic exists because travel operators deserve better software." description="The product brings together bookings, teams, guests, suppliers, operations, and AI into one elegant system." />
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {values.map(([Icon, title, text]) => (
              <div key={String(title)} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <h2 className="mt-4 text-lg font-semibold text-foreground">{title as string}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text as string}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
