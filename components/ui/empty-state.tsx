import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Premium empty state for modules that are not built yet (or have no data).
 * Honest by design: name the phase, explain what is coming, offer a useful CTA.
 */
export function EmptyState({
  icon: Icon,
  phase,
  title,
  description,
  actions,
  footnote,
  className,
}: {
  icon: LucideIcon;
  phase?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  footnote?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      {phase ? (
        <span className="mt-4 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
          {phase}
        </span>
      ) : null}
      <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      {footnote ? <p className="mt-4 text-xs text-muted-foreground/80">{footnote}</p> : null}
    </div>
  );
}
