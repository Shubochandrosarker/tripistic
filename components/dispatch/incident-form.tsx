"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_LABELS, INCIDENT_SEVERITIES, INCIDENT_SEVERITY_LABELS, INCIDENT_STATUSES } from "@/lib/constants";

export function IncidentCreateForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      severity: String(form.get("severity") ?? "medium"),
      category: String(form.get("category") ?? "other"),
      description: String(form.get("description") ?? "").trim(),
    };
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not report this incident.");
        return;
      }
      setOpen(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Report incident
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-96">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Severity" htmlFor="inc-severity">
          <Select id="inc-severity" name="severity" defaultValue="medium">
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_SEVERITY_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" htmlFor="inc-category">
          <Select id="inc-category" name="category" defaultValue="other">
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INCIDENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What happened" htmlFor="inc-description">
        <textarea
          id="inc-description"
          name="description"
          required
          minLength={5}
          rows={3}
          maxLength={4000}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={busy}>
          {busy ? "Reporting…" : "Report incident"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function IncidentStatusSelect({ workspaceId, incidentId, status }: { workspaceId: string; incidentId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(next: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select value={status} disabled={busy} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" aria-label="Incident status">
      {INCIDENT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  );
}
