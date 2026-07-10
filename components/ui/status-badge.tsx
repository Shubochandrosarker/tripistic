import { cn } from "@/lib/utils";

type Tone = "green" | "blue" | "amber" | "orange" | "red" | "gray";

const toneClasses: Record<Tone, string> = {
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/20",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20",
  orange:
    "bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-400/20",
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20",
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-400/20",
};

const statusTones: Record<string, Tone> = {
  active: "green",
  accepted: "green",
  trialing: "blue",
  pending: "amber",
  past_due: "orange",
  suspended: "orange",
  cancelled: "red",
  expired: "red",
  revoked: "red",
  archived: "gray",
  deactivated: "gray",
  inactive: "gray",
};

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const resolvedTone = tone ?? statusTones[status] ?? "gray";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneClasses[resolvedTone],
        className,
      )}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
