import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { OnboardingItem } from "@/lib/onboarding";
import { cn } from "@/lib/utils";

export function SetupChecklist({
  items,
  compact,
}: {
  items: OnboardingItem[];
  compact?: boolean;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-muted/60 rounded-lg"
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                item.done
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card text-transparent",
              )}
              aria-hidden
            >
              <Check className="size-3" />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-medium",
                  item.done ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {item.title}
              </span>
              {!compact ? (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </span>
            {item.phase && !item.done ? (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {item.phase}
              </span>
            ) : null}
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
