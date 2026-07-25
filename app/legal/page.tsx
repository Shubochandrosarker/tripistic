import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck } from "lucide-react";

import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SectionIntro } from "@/components/marketing/marketing-sections";
import { formatContentDate, listContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/legal";
const TITLE = "Legal Center";
const DESCRIPTION =
  "Every Tripistic legal document in one place — privacy, terms, cookies, GDPR, CCPA, DPA, acceptable use, security, SLA, refunds, licensing, accessibility, and copyright.";

export const metadata = buildMetadata({
  title: `${TITLE} · Privacy, Terms, Security & Compliance`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Legal",
  keywords: [
    "tripistic legal",
    "tour operator software terms",
    "travel software privacy policy",
    "travel platform DPA",
    "GDPR travel software",
  ],
});

export const revalidate = 3600;

const CATEGORY_ORDER = ["Privacy & Data", "Terms & Billing", "Security & Compliance", "Product & IP"];

export default function LegalIndexPage() {
  const docs = listContent("legal");
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    docs: docs.filter((doc) => doc.category === category),
  })).filter((group) => group.docs.length > 0);

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          itemListSchema({
            name: "Tripistic legal documents",
            items: docs.map((doc) => ({
              name: doc.title,
              href: `/legal/${doc.slug}`,
              description: doc.description,
            })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Legal", href: PATH }]} />
          <SectionIntro
            eyebrow="Legal"
            title="Legal, privacy, and compliance center"
            description="Clear, current documents for the teams that need them — procurement, security review, data protection, and finance. Every policy is versioned and dated."
          />

          <div className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> GDPR & UK GDPR
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> CCPA / CPRA
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> DPA with SCCs
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> WCAG 2.2 AA
            </span>
          </div>

          <div className="mt-14 space-y-12">
            {groups.map((group) => (
              <section key={group.category} aria-labelledby={`group-${group.category}`}>
                <h2
                  id={`group-${group.category}`}
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.category}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.docs.map((doc, index) => (
                    <AnimatedReveal key={doc.slug} delay={Math.min(index * 0.03, 0.15)}>
                      <Link
                        href={`/legal/${doc.slug}`}
                        className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                      >
                        <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <FileText className="size-4.5" aria-hidden />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold text-foreground">{doc.title}</h3>
                        <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                          {doc.description}
                        </p>
                        <span className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Updated {formatContentDate(doc.updatedAt)}</span>
                          <ArrowRight
                            className="size-3.5 text-accent transition group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </span>
                      </Link>
                    </AnimatedReveal>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-14 rounded-lg border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">Security review or procurement?</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Enterprise teams can request our security documentation, control summaries, subprocessor
              list, and a countersigned Data Processing Agreement. We also complete vendor security
              questionnaires.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link href="/contact" className="font-medium text-accent hover:underline">
                Contact the team →
              </Link>
              <Link href="/legal/security-policy" className="font-medium text-accent hover:underline">
                Read the Security Policy →
              </Link>
              <Link
                href="/legal/data-processing-agreement"
                className="font-medium text-accent hover:underline"
              >
                Read the DPA →
              </Link>
            </div>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
