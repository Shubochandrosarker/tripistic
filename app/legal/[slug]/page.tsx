import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Mail } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Prose } from "@/components/marketing/prose";
import { TableOfContents } from "@/components/marketing/table-of-contents";
import { formatContentDate, getContent, listContent, relatedContent } from "@/lib/content";
import { extractHeadings } from "@/lib/content/markdown";
import { buildMetadata } from "@/lib/seo/metadata";
import { articleSchema, webPageSchema } from "@/lib/seo/schema";
import { SITE } from "@/lib/seo/site";

export const revalidate = 3600;

export function generateStaticParams() {
  return listContent("legal").map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("legal", slug);
  if (!doc) return buildMetadata({ title: "Not found", description: "", path: `/legal/${slug}`, noIndex: true });

  return buildMetadata({
    title: `${doc.title} · Tripistic`,
    description: doc.description,
    path: `/legal/${doc.slug}`,
    eyebrow: doc.eyebrow || "Legal",
    type: "article",
    publishedTime: doc.publishedAt,
    modifiedTime: doc.updatedAt,
    keywords: [`tripistic ${doc.title.toLowerCase()}`, "travel software legal", doc.category.toLowerCase()],
  });
}

export default async function LegalDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("legal", slug);
  if (!doc) notFound();

  const headings = extractHeadings(doc.body);
  const related = relatedContent(doc, 4);
  const path = `/legal/${doc.slug}`;

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: doc.title, description: doc.description, path }),
          articleSchema({
            title: doc.title,
            description: doc.description,
            path,
            publishedAt: doc.publishedAt,
            updatedAt: doc.updatedAt,
            category: doc.category,
          }),
        ]}
      />
      <main id="main" className="px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs
            items={[
              { name: "Legal", href: "/legal" },
              { name: doc.title, href: path },
            ]}
          />

          <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
            <article>
              <header className="border-b border-border pb-8">
                {doc.eyebrow ? (
                  <p className="text-sm font-semibold uppercase tracking-wide text-accent">{doc.eyebrow}</p>
                ) : null}
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {doc.title}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                  {doc.description}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" aria-hidden />
                    Last updated {formatContentDate(doc.updatedAt)}
                  </span>
                  <span>·</span>
                  <span>Effective {formatContentDate(doc.publishedAt)}</span>
                  <span>·</span>
                  <span>{doc.readingTime} min read</span>
                </div>
              </header>

              <Prose body={doc.body} className="mt-8" />

              <div className="mt-12 rounded-lg border border-border bg-card p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Mail className="size-4 text-accent" aria-hidden /> Questions about this document?
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Email{" "}
                  <a href={`mailto:${SITE.legalEmail}`} className="font-medium text-accent hover:underline">
                    {SITE.legalEmail}
                  </a>{" "}
                  or use the{" "}
                  <Link href="/contact" className="font-medium text-accent hover:underline">
                    contact form
                  </Link>
                  . Enterprise teams can request countersigned copies and completed security
                  questionnaires.
                </p>
              </div>
            </article>

            <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              <TableOfContents headings={headings} />
              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Related documents
                </p>
                <ul className="mt-3 space-y-2">
                  {related.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/legal/${item.slug}`}
                        className="block text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/legal"
                  className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
                >
                  All legal documents →
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </MarketingShell>
  );
}
