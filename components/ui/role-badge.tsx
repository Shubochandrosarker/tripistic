import { ROLE_LABELS, type WorkspaceRoleValue } from "@/lib/constants";
import { cn } from "@/lib/utils";

const roleClasses: Record<WorkspaceRoleValue, string> = {
  workspace_owner:
    "bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-400 dark:ring-violet-400/20",
  workspace_admin:
    "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/20",
  guide:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  staff:
    "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20",
  viewer:
    "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-400/20",
};

export function RoleBadge({
  role,
  className,
}: {
  role: WorkspaceRoleValue | string;
  className?: string;
}) {
  const known = (role in roleClasses ? role : "viewer") as WorkspaceRoleValue;
  const label = ROLE_LABELS[known] ?? role;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        roleClasses[known],
        className,
      )}
    >
      {label}
    </span>
  );
}
