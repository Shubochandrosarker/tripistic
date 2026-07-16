"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatusValue } from "@/lib/constants";

export function LeadCreateForm({ workspaceId }: { workspaceId: string }) {
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
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim() || undefined,
      phone: String(form.get("phone") ?? "").trim() || undefined,
      source: String(form.get("source") ?? "").trim() || undefined,
      estimatedValueCents: form.get("estimatedValue")
        ? Math.round(Number(form.get("estimatedValue")) * 100)
        : undefined,
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not create this lead.");
        return;
      }
      setOpen(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError("Could not create this lead. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add lead
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-96">
      <Field label="Name" htmlFor="lead-name">
        <Input id="lead-name" name="name" required maxLength={100} placeholder="Jordan Rivera" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="lead-email">
          <Input id="lead-email" name="email" type="email" maxLength={254} />
        </Field>
        <Field label="Phone" htmlFor="lead-phone">
          <Input id="lead-phone" name="phone" type="tel" maxLength={40} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Source" htmlFor="lead-source" hint="e.g. Instagram, referral">
          <Input id="lead-source" name="source" maxLength={80} />
        </Field>
        <Field label="Est. value" htmlFor="lead-value" hint="In your workspace currency">
          <Input id="lead-value" name="estimatedValue" type="number" min={0} step="0.01" />
        </Field>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Create lead"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function LeadStatusSelect({
  workspaceId,
  leadId,
  status,
}: {
  workspaceId: string;
  leadId: string;
  status: LeadStatusValue;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(next: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const closed = status === "won" || status === "lost";

  return (
    <Select
      value={status}
      disabled={busy || closed}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 text-xs"
      aria-label="Lead status"
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {LEAD_STATUS_LABELS[s]}
        </option>
      ))}
    </Select>
  );
}

export function ConvertLeadButton({ workspaceId, leadId }: { workspaceId: string; leadId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConvert() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not convert this lead.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" onClick={onConvert} disabled={busy}>
        {busy ? "Converting…" : "Convert to customer"}
      </Button>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
