"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  Command,
  FileText,
  Map,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { NavSection } from "@/components/app/nav-items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type: "booking" | "customer" | "tour" | "itinerary";
  label: string;
  description: string;
  href: string;
};

type CommandItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Search;
  keywords: string;
};

const aiCommands: CommandItem[] = [
  {
    id: "ai-itinerary",
    label: "Generate AI itinerary",
    description: "Open the itinerary builder",
    href: "/dashboard/itineraries",
    icon: Sparkles,
    keywords: "ai itinerary generator proposal trip builder",
  },
  {
    id: "ai-growth",
    label: "Review AI growth insights",
    description: "Open pricing, demand, and marketing recommendations",
    href: "/dashboard/ai-growth",
    icon: Bot,
    keywords: "ai business brain growth analytics recommendations",
  },
  {
    id: "new-booking",
    label: "Create manual booking",
    description: "Add a phone, email, or walk-in reservation",
    href: "/dashboard/bookings/new",
    icon: CalendarCheck,
    keywords: "booking reservation manual create",
  },
];

const resultIcons = {
  booking: CalendarCheck,
  customer: UserRound,
  tour: Map,
  itinerary: FileText,
};

export function CommandPalette({
  open,
  onOpenChange,
  sections,
  activeWorkspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: NavSection[];
  activeWorkspaceId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const navCommands = sections.flatMap((section) =>
      section.items.map((item) => ({
        id: item.href,
        label: item.label,
        description: section.title ? section.title : "Navigation",
        href: item.href,
        icon: item.icon,
        keywords: `${item.label} ${section.title ?? ""}`,
      })),
    );
    return [...aiCommands, ...navCommands];
  }, [sections]);

  const filteredCommands = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands.slice(0, 8);
    return commands
      .filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [commands, query]);

  useEffect(() => {
    const needle = query.trim();
    if (!activeWorkspaceId || needle.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/workspaces/${activeWorkspaceId}/search?q=${encodeURIComponent(needle)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search failed");
        const data = (await response.json()) as { results: SearchResult[] };
        setResults(data.results);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeWorkspaceId, query]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/35 px-3 py-16 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder="Search or run a command..."
            className="h-8 border-0 bg-transparent px-0 focus-visible:outline-0"
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Esc
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Commands
          </p>
          {filteredCommands.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.href)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              </button>
            );
          })}

          {activeWorkspaceId ? (
            <>
              <p className="mt-3 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Workspace Results
              </p>
              {loading ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">Searching...</p>
              ) : results.length > 0 ? (
                results.map((result) => {
                  const Icon = resultIcons[result.type];
                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => go(result.href)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                          result.type === "itinerary" ? "text-accent" : undefined,
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{result.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{result.description}</span>
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  );
                })
              ) : query.trim().length >= 2 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No matching workspace records.</p>
              ) : (
                <p className="px-2 py-3 text-sm text-muted-foreground">Type two or more characters to search records.</p>
              )}
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/45 px-4 py-2 text-xs text-muted-foreground">
          <Command className="size-3.5" aria-hidden />
          Press Ctrl K or Command K anywhere in the app.
        </div>
      </div>
    </div>
  );
}
