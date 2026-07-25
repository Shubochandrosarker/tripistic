import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, Clock3, User } from "lucide-react";

import { Breadcrumbs } from "@/components/marketing/breadcrumbs";
import { Prose } from "@/components/marketing/prose";
import { TableOfContents } from "@/components/marketing/table-of-contents";
import { formatContentDate, type ContentDoc } from "@/lib/content";
import { extractHeadings } from "@/lib/content/markdown";
import type { BreadcrumbItem } from "@/lib/seo/schema";

/**
 * Shared reading layout for every authored document — docs, help articles,
 * blog posts, and developer reference pages.
 */
export function ContentArticle({
  doc,
  breadcrumbs,
  basePath,
  related,
  showAuthor = false,
  sidebar,
  footer,
}: {
  doc: ContentDoc;
  breadcrumbs: BreadcrumbItem[];
  basePath: string;
  related: ContentDoc[];
  showAuthor?: boolean;
  sidebar?: ReactNode;
  footer?: ReactNode;
}) {
  const headings = extractHeadings(doc.body);

  return (
    <main id="main" className="px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <Breadcrumbs items={breadcrumbs} />

        <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
          <article>
            <header className="border-b border-border pb-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  {doc.category}
                </span>
                {doc.eyebrow ? (
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {doc.eyebrow}
                  </span>
                ) : null}
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {doc.title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                {doc.description}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {showAuthor ? (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="size-3.5" aria-hidden />
                    {doc.author}
                    {doc.authorRole ? ` · ${doc.authorRole}` : ""}
                  </span>
                ) : null}
                {doc.publishedAt ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" aria-hidden />
                    <time dateTime={doc.publishedAt}>{formatContentDate(doc.publishedAt)}</time>
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" aria-hidden />
                  {doc.readingTime} min read
                </span>
              </div>

              {doc.tags.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {doc.tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : null}
            </header>

            <Prose body={doc.body} className="mt-8" />

            {footer}
          </article>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <TableOfContents headings={headings} />
            {sidebar}
            {related.length > 0 ? (
              <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Keep reading
                </p>
                <ul className="mt-3 space-y-3">
                  {related.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`${basePath}/${item.slug}`}
                        className="block text-sm font-medium leading-6 text-foreground transition-colors hover:text-accent"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {item.category}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
