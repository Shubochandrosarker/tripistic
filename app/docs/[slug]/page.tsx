import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/marketing/content-article";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand } from "@/components/marketing/marketing-sections";
import { getContent, listContent, relatedContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { techArticleSchema, webPageSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export function generateStaticParams() {
  return listContent("docs").map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("docs", slug);
  if (!doc) {
    return buildMetadata({ title: "Not found", description: "", path: `/docs/${slug}`, noIndex: true });
  }

  return buildMetadata({
    title: `${doc.title} · Tripistic Documentation`,
    description: doc.description,
    path: `/docs/${doc.slug}`,
    eyebrow: "Documentation",
    type: "article",
    publishedTime: doc.publishedAt,
    modifiedTime: doc.updatedAt,
    keywords: [`tripistic ${doc.title.toLowerCase()}`, ...doc.tags],
  });
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("docs", slug);
  if (!doc) notFound();

  const path = `/docs/${doc.slug}`;
  const all = listContent("docs");
  const position = all.findIndex((item) => item.slug === doc.slug);
  const previous = position > 0 ? all[position - 1] : null;
  const next = position < all.length - 1 ? all[position + 1] : null;

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: doc.title, description: doc.description, path }),
          techArticleSchema({
            title: doc.title,
            description: doc.description,
            path,
            publishedAt: doc.publishedAt,
            updatedAt: doc.updatedAt,
            category: doc.category,
            tags: doc.tags,
          }),
        ]}
      />
      <ContentArticle
        doc={doc}
        basePath="/docs"
        related={relatedContent(doc, 4)}
        breadcrumbs={[
          { name: "Documentation", href: "/docs" },
          { name: doc.title, href: path },
        ]}
        sidebar={
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Need help?
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Search the{" "}
              <Link href="/help" className="font-medium text-accent hover:underline">
                Help Center
              </Link>{" "}
              or{" "}
              <Link href="/contact" className="font-medium text-accent hover:underline">
                contact support
              </Link>
              .
            </p>
          </div>
        }
        footer={
          <nav
            aria-label="Documentation pagination"
            className="mt-12 grid gap-4 border-t border-border pt-8 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={`/docs/${previous.slug}`}
                className="rounded-lg border border-border bg-card p-4 transition hover:border-accent/40"
              >
                <span className="text-xs text-muted-foreground">Previous</span>
                <span className="mt-1 block text-sm font-medium text-foreground">
                  {previous.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link
                href={`/docs/${next.slug}`}
                className="rounded-lg border border-border bg-card p-4 text-right transition hover:border-accent/40 sm:col-start-2"
              >
                <span className="text-xs text-muted-foreground">Next</span>
                <span className="mt-1 block text-sm font-medium text-foreground">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        }
      />
      <CtaBand />
    </MarketingShell>
  );
}
