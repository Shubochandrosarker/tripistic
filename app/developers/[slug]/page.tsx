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
  return listContent("developers").map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("developers", slug);
  if (!doc) {
    return buildMetadata({
      title: "Not found",
      description: "",
      path: `/developers/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${doc.title} · Tripistic API`,
    description: doc.description,
    path: `/developers/${doc.slug}`,
    eyebrow: "Developers",
    type: "article",
    publishedTime: doc.publishedAt,
    modifiedTime: doc.updatedAt,
    keywords: [`tripistic api ${doc.title.toLowerCase()}`, ...doc.tags],
  });
}

export default async function DeveloperReferencePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getContent("developers", slug);
  if (!doc) notFound();

  const path = `/developers/${doc.slug}`;
  const all = listContent("developers");
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
        basePath="/developers"
        related={relatedContent(doc, 4)}
        breadcrumbs={[
          { name: "Developers", href: "/developers" },
          { name: doc.title, href: path },
        ]}
        sidebar={
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Specification
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Generate a client, mock the API, or run contract tests from the published document.
            </p>
            <a
              href="/openapi.json"
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              openapi.json →
            </a>
          </div>
        }
        footer={
          <nav
            aria-label="Reference pagination"
            className="mt-12 grid gap-4 border-t border-border pt-8 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={`/developers/${previous.slug}`}
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
                href={`/developers/${next.slug}`}
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
