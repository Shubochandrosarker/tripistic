import { List } from "lucide-react";

import type { Heading } from "@/lib/content/markdown";

export function TableOfContents({ headings }: { headings: Heading[] }) {
  if (headings.length < 2) return null;

  return (
    <nav aria-labelledby="toc-heading" className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p id="toc-heading" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <List className="size-3.5" aria-hidden /> On this page
      </p>
      <ul className="mt-3 space-y-1.5">
        {headings.map((heading) => (
          <li key={heading.id} className={heading.level === 3 ? "pl-3" : undefined}>
            <a
              href={`#${heading.id}`}
              className="block rounded text-sm leading-6 text-muted-foreground transition-colors hover:text-foreground"
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
