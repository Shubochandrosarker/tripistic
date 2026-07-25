import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AnimatedReveal } from "@/components/marketing/animated-reveal";
import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, SectionIntro } from "@/components/marketing/marketing-sections";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { categorySlug, formatContentDate, listCategories, listContent } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { itemListSchema, webPageSchema } from "@/lib/seo/schema";

const PATH = "/blog";
const TITLE = "Blog";
const DESCRIPTION =
  "Travel technology, AI, automation, growth, marketing, operations, product updates, case studies, and industry news for modern tour operators.";

export const metadata = buildMetadata({
  title: `${TITLE} · Ideas for modern travel operations`,
  description: DESCRIPTION,
  path: PATH,
  eyebrow: "Blog",
  keywords: [
    "tour operator blog",
    "travel technology blog",
    "direct booking strategy",
    "travel operations best practices",
    "AI for tour operators",
  ],
});

export const revalidate = 3600;

export default function BlogPage() {
  const posts = listContent("blog");
  const categories = listCategories("blog");
  const [lead, ...rest] = posts;

  return (
    <MarketingShell>
      <JsonLd
        schema={[
          webPageSchema({ title: TITLE, description: DESCRIPTION, path: PATH }),
          itemListSchema({
            name: "Tripistic blog",
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
          <Breadcrumbs items={[{ name: "Blog", href: PATH }]} />
          <SectionIntro
            eyebrow="Blog"
            title="Ideas for the next generation of travel operations."
            description="Practical writing on direct booking, AI, automation, operations, and the economics of running a modern tour business."
          />

          <nav aria-label="Blog categories" className="mt-10 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
              All
            </span>
            {categories.map((category) => (
              <Link
                key={category}
                href={`/blog/category/${categorySlug(category)}`}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
              >
                {category}
              </Link>
            ))}
          </nav>

          {lead ? (
            <AnimatedReveal className="mt-12">
              <Link
                href={`/blog/${lead.slug}`}
                className="group block rounded-lg border border-border bg-card p-6 shadow-sm transition hover:border-accent/40 hover:shadow-md sm:p-8"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
                    {lead.category}
                  </span>
                  <time dateTime={lead.publishedAt} className="text-muted-foreground">
                    {formatContentDate(lead.publishedAt)}
                  </time>
                  <span className="text-muted-foreground">{lead.readingTime} min read</span>
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  {lead.title}
                </h2>
                <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
                  {lead.excerpt}
                </p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent">
                  Read the article{" "}
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </AnimatedReveal>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rest.map((post, index) => (
              <AnimatedReveal key={post.slug} delay={Math.min(index * 0.03, 0.15)}>
                <article className="h-full">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-accent/10 px-2.5 py-1 font-medium text-accent">
                        {post.category}
                      </span>
                      <time dateTime={post.publishedAt} className="text-muted-foreground">
                        {formatContentDate(post.publishedAt)}
                      </time>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold leading-snug text-foreground">
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

          <div className="mt-14">
            <NewsletterSignup />
          </div>
        </div>
      </main>
      <CtaBand />
    </MarketingShell>
  );
}
