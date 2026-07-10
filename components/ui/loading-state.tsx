import { cn } from "@/lib/utils";

export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
