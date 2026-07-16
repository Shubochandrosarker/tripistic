"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavSection } from "@/components/app/nav-items";
import { cn } from "@/lib/utils";

export function SidebarNav({
  sections,
  onNavigate,
}: {
  sections: NavSection[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main navigation">
      {sections.map((section, index) => (
        <div key={section.title ?? index}>
          {section.title ? (
            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {section.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    // The sidebar now lists ~20 destinations at once (Phases
                    // 5-12 added several new sections) — Next.js prefetches
                    // every in-viewport Link by default, which was firing a
                    // burst of concurrent RSC requests on every page load
                    // and measurably delaying real navigations against a
                    // single-process `next start` server. A sidebar entry is
                    // clicked deliberately, not hovered speculatively, so
                    // eager prefetching buys little here.
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-4",
                        active ? "text-accent" : "text-muted-foreground/70 group-hover:text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
