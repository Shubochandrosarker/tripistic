"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn, initials } from "@/lib/utils";

export type WorkspaceOption = {
  id: string;
  name: string;
  role: string;
};

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
}: {
  workspaces: WorkspaceOption[];
  activeWorkspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function switchTo(id: string) {
    if (id === activeWorkspaceId || busy) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${id}/activate`, { method: "POST" });
      if (res.ok) {
        setOpen(false);
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!active) return null;

  return (
    <div className="relative px-3 pt-3" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-xs font-semibold text-accent">
          {initials(active.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {active.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {active.role.replace(/^workspace_/, "").replace(/_/g, " ")}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-3 right-3 z-40 mt-1.5 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <p className="px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            Workspaces
          </p>
          <ul className="max-h-64 overflow-y-auto p-1">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={workspace.id === active.id}
                  disabled={busy}
                  onClick={() => switchTo(workspace.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                    workspace.id === active.id ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                    {initials(workspace.name)}
                  </span>
                  <span className="flex-1 truncate">{workspace.name}</span>
                  {workspace.id === active.id ? (
                    <Check className="size-4 text-accent" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border p-1">
            <Link
              href="/workspaces/new"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" aria-hidden />
              Create workspace
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
