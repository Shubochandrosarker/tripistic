import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import {
  categorySlug,
  findCategoryBySlug,
  formatContentDate,
  listCategories,
  listContent,
} from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

export const revalidate = 3600;

export function generateStaticParams() {
  return listCategories("blog").map((category) => ({ category: categorySlug(category) }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  const category = findCategoryBySlug("blog", slug);
  if (!category) {
    return buildMetadata({
      title: "Not found",
      description: "",
      path: `/blog/category/${slug}`,
      noIndex: true,
    });
  }

  return buildMetadata({
    title: `${category} · Tripistic Blog`,
    description: `Articles on ${category.toLowerCase()} for tour operators, travel agencies, and destination management companies.`,
    path: `/blog/category/${slug}`,
    eyebrow: "Blog",
    keywords: [`${category.toLowerCase()} for tour operators`, "travel technology", "tripistic blog"],
  });
}

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = findCategoryBySlug("blog", slug);
  if (!category) notFound();

  const posts = listContent("blog").filter((post) => post.category === category);
  const categories = listCategories("blog");
  const path = `/blog/category/${slug}`;
  const description = `Articles on ${category.toLowerCase()} for modern travel operations.`;

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: category, description, path }),
          itemListSchema({
            name: `${category} articles`,
            items: posts.map((post) => ({
              name: post.title,
              href: `/blog/${post.slug}`,
              description: post.description,
            })),
          }),
        ]}
      />
      <main id="main" className="px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <Breadcrumbs
            items={[
              { name: "Blog", href: "/blog" },
              { name: category, href: path },
            ]}
          />
          <SectionIntro eyebrow="Category" title={category} description={description} />

          <nav aria-label="Blog categories" className="mt-10 flex flex-wrap justify-center gap-2">
            <Link
              href="/blog"
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
            >
              All
            </Link>
            {categories.map((item) => {
              const isActive = item === category;
              return (
                <Link
                  key={item}
                  href={`/blog/category/${categorySlug(item)}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
                      : "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
                  }
                >
                  {item}
                </Link>
              );
            })}
          </nav>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <AnimatedReveal key={post.slug} delay={Math.min(index * 0.03, 0.15)}>
                <article className="h-full">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                  >
                    <time dateTime={post.publishedAt} className="text-xs text-muted-foreground">
                      {formatContentDate(post.publishedAt)}
                    </time>
                    <h2 className="mt-2 text-lg font-semibold leading-snug text-foreground">
                      {post.title}
                    </h2>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">
                      {post.excerpt}
                    </p>
                    <span className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{post.readingTime} min read</span>
                      <ArrowRight
                        className="size-3.5 text-accent transition group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </Link>
                </article>
              </AnimatedReveal>
            ))}
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
