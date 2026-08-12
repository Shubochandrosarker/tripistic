"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "editor", label: "Editor" },
  { segment: "pages", label: "Pages" },
  { segment: "brand", label: "Brand" },
  { segment: "seo", label: "SEO" },
  { segment: "domain", label: "Domain" },
  { segment: "settings", label: "Settings" },
] as const;

export function SiteTabs({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/sites/${siteId}`;

  return (
    <nav aria-label="Website sections" className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          // Exact match for Overview, prefix for the rest: without the
          // distinction Overview would highlight on every nested route.
          const activeTab = tab.segment ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={activeTab ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                  activeTab
                    ? "border-accent font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
