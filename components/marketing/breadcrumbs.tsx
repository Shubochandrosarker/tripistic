import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { JsonLd } from "@/components/marketing/json-ld";
import { breadcrumbSchema, type BreadcrumbItem } from "@/lib/seo/schema";

/**
 * Accessible breadcrumb trail that also emits BreadcrumbList structured data.
 * The final item is the current page and is not linked.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const trail: BreadcrumbItem[] = [{ name: "Home", href: "/" }, ...items];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {trail.map((item, index) => {
            const isLast = index === trail.length - 1;
            return (
              <li key={item.href} className="flex items-center gap-1">
                {isLast ? (
                  <span aria-current="page" className="font-medium text-foreground">
                    {item.name}
                  </span>
                ) : (
                  <Link href={item.href} className="rounded transition-colors hover:text-foreground">
                    {item.name}
                  </Link>
                )}
                {isLast ? null : <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </nav>
      <JsonLd schema={[breadcrumbSchema(trail)]} />
    </>
  );
}
