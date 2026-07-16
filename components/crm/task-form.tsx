"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export function TaskCreateForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const dueAtRaw = String(form.get("dueAt") ?? "").trim();
    const payload = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim() || undefined,
      dueAt: dueAtRaw ? new Date(dueAtRaw).toISOString() : undefined,
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/crm-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not create this task.");
        return;
      }
      setOpen(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError("Could not create this task. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add task
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-96">
      <Field label="Title" htmlFor="task-title">
        <Input id="task-title" name="title" required maxLength={200} placeholder="Follow up on quote" />
      </Field>
      <Field label="Due" htmlFor="task-due">
        <Input id="task-due" name="dueAt" type="datetime-local" />
      </Field>
      <Field label="Description" htmlFor="task-desc">
        <textarea
          id="task-desc"
          name="description"
          rows={2}
          maxLength={2000}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </Field>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Create task"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ToggleTaskButton({ workspaceId, taskId, status }: { workspaceId: string; taskId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onToggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/crm-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: status === "done" ? "open" : "done" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={status === "done" ? "ghost" : "secondary"} size="sm" onClick={onToggle} disabled={busy}>
      {status === "done" ? "Reopen" : "Mark done"}
    </Button>
  );
}
