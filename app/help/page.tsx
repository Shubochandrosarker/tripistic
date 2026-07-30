import Link from "next/link";
import { ArrowRight, LifeBuoy, MessageSquare, Users } from "lucide-react";

import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { ContentSearch } from "@/components/marketing/content-search";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { listCategories, listContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/help";
const TITLE = "Help Center";
const DESCRIPTION =
  "Searchable Tripistic knowledge base — setup guides, booking and payment answers, operations how-tos, troubleshooting, and support contacts.";

export const metadata = buildMetadata({
  title: `${TITLE} · Answers, troubleshooting, and support`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Support",
  keywords: [
    "tripistic help",
    "tour operator software support",
    "booking software troubleshooting",
    "travel software knowledge base",
  ],
});

export const revalidate = 3600;

export default function HelpPage() {
  const articles = listContent("help");
  const categories = listCategories("help");
  const troubleshooting = articles.filter((doc) => doc.category === "Troubleshooting");

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          itemListSchema({
            name: "Tripistic help articles",
            items: articles.map((doc) => ({
              name: doc.title,
              href: `/help/${doc.slug}`,
              description: doc.description,
            })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs items={[{ name: "Help Center", href: PATH }]} />
          <SectionIntro
            eyebrow="Help Center"
            title="Answers, fast."
            description="Search the knowledge base, work through troubleshooting guides, or reach a human. Most questions have an article; the rest have a support team."
          />

          <div className="mt-10">
            <ContentSearch
              docs={articles.map(({ slug, title, description, category }) => ({
                slug,
                title,
                description,
                category,
              }))}
              basePath="/help"
              placeholder="Search for an answer…"
            />
          </div>

          <div className="mt-14 space-y-12">
            {categories.map((category) => {
              const items = articles.filter((doc) => doc.category === category);
              return (
                <section key={category} aria-labelledby={`help-${category}`}>
                  <h2
                    id={`help-${category}`}
                    className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {category}
                  </h2>
                  <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((doc, index) => (
                      <AnimatedReveal key={doc.slug} delay={Math.min(index * 0.03, 0.15)}>
                        <Link
                          href={`/help/${doc.slug}`}
                          className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                        >
                          <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                            <LifeBuoy className="size-4.5" aria-hidden />
                          </span>
                          <h3 className="mt-4 text-base font-semibold text-foreground">
                            {doc.title}
                          </h3>
                          <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                            {doc.description}
                          </p>
                          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
                            Read{" "}
                            <ArrowRight
                              className="size-3.5 transition group-hover:translate-x-0.5"
                              aria-hidden
                            />
                          </span>
                        </Link>
                      </AnimatedReveal>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <section aria-labelledby="troubleshooting-heading" className="mt-14">
            <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
              <h2 id="troubleshooting-heading" className="text-xl font-semibold text-foreground">
                Something not working?
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Start with the diagnostic guides — they cover the causes behind the majority of
                support requests, in the order worth checking them.
              </p>
              <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                {troubleshooting.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/help/${doc.slug}`}
                      className="flex items-center justify-between rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent/10"
                    >
                      {doc.title}
                      <ArrowRight className="size-3.5 text-accent" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="support-heading" className="mt-6">
            <h2 id="support-heading" className="sr-only">
              More support options
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  icon: MessageSquare,
                  title: "Contact support",
                  description:
                    "Email or in-app support with response targets by plan. Enterprise gets a named contact and 24×7 P1 coverage.",
                  href: "/contact",
                  cta: "Get in touch",
                },
                {
                  icon: Users,
                  title: "Community & roadmap",
                  description:
                    "See what is planned, vote on priorities, and follow releases as they ship.",
                  href: "/roadmap",
                  cta: "Open the roadmap",
                },
              ].map((item) => (
                <div key={item.href} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <item.icon className="size-4.5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  <Link
                    href={item.href}
                    className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
                  >
                    {item.cta} →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
