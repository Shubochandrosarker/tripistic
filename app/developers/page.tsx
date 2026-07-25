import Link from "next/link";
import { ArrowRight, Code2, KeyRound, Terminal, Webhook } from "lucide-react";

import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { listContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/developers";
const TITLE = "Developer Documentation";
const DESCRIPTION =
  "Build on Tripistic — REST API, authentication, webhooks with signature verification, SDK generation, examples, rate limits, and the OpenAPI 3.1 specification.";

export const metadata = buildMetadata({
  title: `${TITLE} · REST API, webhooks, and SDKs`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Developers",
  keywords: [
    "tripistic api",
    "tour operator api",
    "travel booking api",
    "booking webhooks",
    "travel software openapi",
  ],
});

export const revalidate = 3600;

const QUICKSTART = `curl https://tripistic.com/api/workspaces/$WORKSPACE_ID/bookings \\
  -H "Authorization: Bearer $TRIPISTIC_API_KEY" \\
  -H "Content-Type: application/json"`;

const HIGHLIGHTS = [
  {
    icon: KeyRound,
    title: "Scoped credentials",
    description:
      "Tokens inherit the role they were issued under and are bound to one workspace. Cross-tenant access is impossible, not merely discouraged.",
  },
  {
    icon: Webhook,
    title: "Signed webhooks",
    description:
      "Every delivery carries an HMAC-SHA256 signature and timestamp, with a six-attempt retry schedule and replayable delivery log.",
  },
  {
    icon: Code2,
    title: "OpenAPI 3.1",
    description:
      "Generate a typed client in any language, spin up a mock server, or run contract tests against the published specification.",
  },
  {
    icon: Terminal,
    title: "Idempotent writes",
    description:
      "Send an Idempotency-Key on creating requests. Retries return the original result instead of duplicating a booking.",
  },
];

export default function DevelopersPage() {
  const references = listContent("developers");

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          itemListSchema({
            name: "Tripistic developer reference",
            items: references.map((doc) => ({
              name: doc.title,
              href: `/developers/${doc.slug}`,
              description: doc.description,
            })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Developers", href: PATH }]} />
          <SectionIntro
            eyebrow="Developers"
            title="Build on the travel operating system."
            description="A predictable REST API over the same domain model the product uses — bookings, availability, customers, operations, and itineraries."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Quickstart</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Issue a key in Settings → API keys, then make your first authenticated request.
              </p>
              <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background p-4 text-xs leading-6 text-foreground">
                <code>{QUICKSTART}</code>
              </pre>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                <Link
                  href="/developers/authentication"
                  className="font-medium text-accent hover:underline"
                >
                  Authentication →
                </Link>
                <Link href="/developers/examples" className="font-medium text-accent hover:underline">
                  Working examples →
                </Link>
                <a href="/openapi.json" className="font-medium text-accent hover:underline">
                  OpenAPI document →
                </a>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {HIGHLIGHTS.map((item) => (
                <div key={item.title} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <item.icon className="size-4.5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          <section aria-labelledby="reference-heading" className="mt-14">
            <h2 id="reference-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Reference
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {references.map((doc, index) => (
                <AnimatedReveal key={doc.slug} delay={Math.min(index * 0.03, 0.15)}>
                  <Link
                    href={`/developers/${doc.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                  >
                    <h3 className="text-lg font-semibold text-foreground">{doc.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                      {doc.description}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                      Read{" "}
                      <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                    </span>
                  </Link>
                </AnimatedReveal>
              ))}
            </div>
          </section>

          <div className="mt-14 rounded-lg border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Support for builders</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Planning a migration, an OTA bridge, or a high-volume import? Tell us before you start
              — we can advise on sequencing and, on enterprise plans, arrange temporary elevated rate
              limits.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link href="/contact" className="font-medium text-accent hover:underline">
                Talk to us →
              </Link>
              <Link href="/docs/api" className="font-medium text-accent hover:underline">
                API overview →
              </Link>
              <Link href="/docs/integrations" className="font-medium text-accent hover:underline">
                Integrations →
              </Link>
            </div>
          </div>
        </div>
      </main>
      <CtaBand title="Ship your integration on a platform that treats the API as a first-class surface." />
    </MarketingShell>
  );
}
