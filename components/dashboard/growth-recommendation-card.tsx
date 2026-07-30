import { Sparkles } from "lucide-react";

/**
 * Growth Recommendations card. Phase 12's Business Brain (lib/analytics/
 * business-brain.ts) can now supply real, computed suggestions — pass
 * `suggestion` + `healthScore` for that. Callers that don't yet fetch a
 * report (or haven't set up any bookings) get the original honest
 * "sample content, not your data" placeholder, unchanged.
 */
export function GrowthRecommendationCard({
  suggestion,
  healthScore,
}: {
  suggestion?: string;
  healthScore?: number;
} = {}) {
  if (suggestion) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-foreground">Growth Recommendation</p>
          {healthScore !== undefined ? (
            <span className="ml-auto rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              Health {healthScore}/100
            </span>
          ) : null}
        </div>
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm text-foreground">{suggestion}</p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Computed from your real booking and occupancy data — see Growth Insights for more.
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-foreground">Growth Recommendations</p>
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
