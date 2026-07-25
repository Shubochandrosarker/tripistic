"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type SearchableDoc = {
  slug: string;
  title: string;
  description: string;
  category: string;
};

/**
 * Client-side search over a pre-indexed document list. The full index is small
 * enough to ship with the page, so results are instant and work offline.
 */
export function ContentSearch({
  docs,
  basePath,
  placeholder = "Search articles…",
  label = "Search the help center",
}: {
  docs: SearchableDoc[];
  basePath: string;
  placeholder?: string;
  label?: string;
}) {
  const [query, setQuery] = useState("");

  const index = useMemo(
    () =>
      docs.map((doc) => ({
        doc,
        haystack: `${doc.title} ${doc.description} ${doc.category}`.toLowerCase(),
      })),
    [docs],
  );

  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return index
      .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
      .slice(0, 8)
      .map((entry) => entry.doc);
  }, [index, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <label htmlFor="content-search" className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id="content-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          aria-describedby="content-search-status"
          className="h-11 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        {hasQuery ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Clear search</span>
          </button>
        ) : null}
      </div>

      <p id="content-search-status" role="status" aria-live="polite" className="sr-only">
        {hasQuery ? `${results.length} results for ${query}` : ""}
      </p>

      {hasQuery ? (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No results for “{query}”. Try a different term or{" "}
              <Link href="/contact" className="font-medium text-accent hover:underline">
                contact support
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`${basePath}/${doc.slug}`}
                    className="block p-4 transition-colors hover:bg-muted"
                  >
                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {doc.description}
                    </p>
                    <p className="mt-1.5 text-xs font-medium text-accent">{doc.category}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
