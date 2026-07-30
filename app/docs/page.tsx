import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";

import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { ContentSearch } from "@/components/marketing/content-search";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { listContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/docs";
const TITLE = "Documentation";
const DESCRIPTION =
  "Tripistic documentation — getting started, bookings, CRM, tours, payments, users, permissions, integrations, FAQ, and release notes.";

export const metadata = buildMetadata({
  title: `${TITLE} · Learn Tripistic from setup to scale`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Docs",
  keywords: [
    "tripistic documentation",
    "tour operator software docs",
    "booking software guide",
    "travel operations documentation",
  ],
});

export const revalidate = 3600;

const GROUP_ORDER = ["Foundations", "Operations", "Administration", "Platform"];

export default function DocsPage() {
  const docs = listContent("docs");
  const groups = GROUP_ORDER.map((category) => ({
    category,
    docs: docs.filter((doc) => doc.category === category),
  })).filter((group) => group.docs.length > 0);

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          itemListSchema({
            name: "Tripistic documentation",
            items: docs.map((doc) => ({
              name: doc.title,
              href: `/docs/${doc.slug}`,
              description: doc.description,
            })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Documentation", href: PATH }]} />
          <SectionIntro
            eyebrow="Documentation"
            title="Learn Tripistic from setup to scale."
            description="Practical guides for operators, admins, partners, and developers adopting the platform — written to be read while you work."
          />

          <div className="mt-10">
            <ContentSearch
              docs={docs.map(({ slug, title, description, category }) => ({
                slug,
                title,
                description,
                category,
              }))}
              basePath="/docs"
              placeholder="Search documentation…"
              label="Search documentation"
            />
          </div>

          <div className="mt-14 space-y-12">
            {groups.map((group) => (
              <section key={group.category} aria-labelledby={`docs-${group.category}`}>
                <h2
                  id={`docs-${group.category}`}
                  className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.category}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.docs.map((doc, index) => (
                    <AnimatedReveal key={doc.slug} delay={Math.min(index * 0.03, 0.15)}>
                      <Link
                        href={`/docs/${doc.slug}`}
                        className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                      >
                        <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                          <BookOpen className="size-4.5" aria-hidden />
                        </span>
                        <h3 className="mt-4 text-lg font-semibold text-foreground">{doc.title}</h3>
                        <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                          {doc.description}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                          Read <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </Link>
                    </AnimatedReveal>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              ["Help Center", "Searchable answers and troubleshooting", "/help"],
              ["Developer reference", "Authentication, REST, webhooks, SDKs", "/developers"],
              ["Interactive demo", "See the product before you sign up", "/demo"],
            ].map(([title, description, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-accent/40"
              >
                <h2 className="text-base font-semibold text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
