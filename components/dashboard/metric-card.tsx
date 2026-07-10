import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dashboard metric card. When the backing module is not live yet, pass
 * `pendingPhase` — the card shows an honest "arrives in Phase X" note
 * instead of fake numbers.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  pendingPhase,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  pendingPhase?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-xs", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {pendingPhase ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Live data arrives in <span className="font-medium text-accent">{pendingPhase}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
