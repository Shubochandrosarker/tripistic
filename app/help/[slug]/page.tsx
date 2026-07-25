import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/marketing/content-article";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand } from "@/components/marketing/marketing-sections";
import { getContent, listContent, relatedContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { articleSchema, webPageSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export function generateStaticParams() {
  return listContent("help").map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("help", slug);
  if (!doc) {
    return buildMetadata({ title: "Not found", description: "", path: `/help/${slug}`, noIndex: true });
  }

  return buildMetadata({
    title: `${doc.title} · Tripistic Help`,
    description: doc.description,
    path: `/help/${doc.slug}`,
    eyebrow: "Help Center",
    type: "article",
    publishedTime: doc.publishedAt,
    modifiedTime: doc.updatedAt,
    keywords: doc.tags,
  });
}

export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getContent("help", slug);
  if (!doc) notFound();

  const path = `/help/${doc.slug}`;

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
            tags: doc.tags,
          }),
        ]}
      />
      <ContentArticle
        doc={doc}
        basePath="/help"
        related={relatedContent(doc, 4)}
        breadcrumbs={[
          { name: "Help Center", href: "/help" },
          { name: doc.title, href: path },
        ]}
        sidebar={
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Still stuck?
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Our support team can look at your specific workspace.
            </p>
            <Link
              href="/contact"
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Contact support →
            </Link>
          </div>
        }
        footer={
          <div className="mt-12 rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Did this answer your question?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              If not, tell us what was missing — help articles are rewritten based on what people
              still have to ask afterwards.{" "}
              <Link href="/contact" className="font-medium text-accent hover:underline">
                Send feedback
              </Link>
              .
            </p>
          </div>
        }
      />
      <CtaBand />
    </MarketingShell>
  );
}
