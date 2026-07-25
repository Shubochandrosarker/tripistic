import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/marketing/content-article";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand } from "@/components/marketing/marketing-sections";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { categorySlug, getContent, listContent, relatedContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { articleSchema, webPageSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export function generateStaticParams() {
  return listContent("blog").map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getContent("blog", slug);
  if (!post) {
    return buildMetadata({ title: "Not found", description: "", path: `/blog/${slug}`, noIndex: true });
  }

  return buildMetadata({
    title: post.title,
    description: post.description,
    path: `/blog/${post.slug}`,
    eyebrow: post.category,
    type: "article",
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: [post.author],
    keywords: post.tags,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getContent("blog", slug);
  if (!post) notFound();

  const path = `/blog/${post.slug}`;

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: post.title, description: post.description, path }),
          articleSchema({
            title: post.title,
            description: post.description,
            path,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            author: post.author,
            category: post.category,
            tags: post.tags,
          }),
        ]}
      />
      <ContentArticle
        doc={post}
        basePath="/blog"
        showAuthor
        related={relatedContent(post, 4)}
        breadcrumbs={[
          { name: "Blog", href: "/blog" },
          { name: post.category, href: `/blog/category/${categorySlug(post.category)}` },
          { name: post.title, href: path },
        ]}
        sidebar={
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              More in {post.category}
            </p>
            <Link
              href={`/blog/category/${categorySlug(post.category)}`}
              className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
            >
              Browse the category →
            </Link>
          </div>
        }
        footer={
          <div className="mt-12">
            <NewsletterSignup />
          </div>
        }
      />
      <CtaBand />
    </MarketingShell>
  );
}
