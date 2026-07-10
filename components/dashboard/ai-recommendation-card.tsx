import { Sparkles } from "lucide-react";

/**
 * Placeholder for the Phase 7 AI Growth Dashboard.
 * Shows a clearly-labeled example — never presented as live data.
 */
export function AIRecommendationCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-foreground">AI Growth Recommendations</p>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Phase 7
        </span>
      </div>

      <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/40 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Example of what you&apos;ll see — sample content, not your data
        </p>
        <p className="mt-1.5 text-sm text-foreground">
          &ldquo;Your Saturday morning tour fills 72% faster than weekdays. Consider adding a
          second Saturday slot.&rdquo;
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Priority: high · Expected impact: +8–12% weekly revenue
        </p>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Once bookings are flowing, Tripistic will analyze occupancy, revenue, channels, and
        cancellations to give you plain-English growth actions. No fake numbers until then.
      </p>
    </div>
  );
}
