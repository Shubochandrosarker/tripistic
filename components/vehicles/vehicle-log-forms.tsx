"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { MAINTENANCE_TYPES, MAINTENANCE_TYPE_LABELS } from "@/lib/constants";

export function MaintenanceLogForm({ workspaceId, vehicleId }: { workspaceId: string; vehicleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      type: String(form.get("type") ?? "service"),
      performedOn: String(form.get("performedOn") ?? ""),
      costCents: form.get("cost") ? Math.round(Number(form.get("cost")) * 100) : undefined,
      vendorName: String(form.get("vendorName") ?? "").trim() || undefined,
      nextDueOn: String(form.get("nextDueOn") ?? "") || undefined,
    };
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vehicles/${vehicleId}/maintenance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save this record.");
        return;
      }
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="maint-type">
          <Select id="maint-type" name="type" defaultValue="service">
            {MAINTENANCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {MAINTENANCE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="maint-date">
          <Input id="maint-date" name="performedOn" type="date" required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cost" htmlFor="maint-cost">
          <Input id="maint-cost" name="cost" type="number" min={0} step="0.01" />
        </Field>
        <Field label="Vendor" htmlFor="maint-vendor">
          <Input id="maint-vendor" name="vendorName" maxLength={120} />
        </Field>
      </div>
      <Field label="Next due" htmlFor="maint-next">
        <Input id="maint-next" name="nextDueOn" type="date" />
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Log maintenance"}
      </Button>
    </form>
  );
}

export function FuelLogForm({ workspaceId, vehicleId }: { workspaceId: string; vehicleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      loggedOn: String(form.get("loggedOn") ?? ""),
      costCents: Math.round(Number(form.get("cost") ?? 0) * 100),
      odometer: form.get("odometer") ? Number(form.get("odometer")) : undefined,
    };
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vehicles/${vehicleId}/fuel-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save this log.");
        return;
      }
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" htmlFor="fuel-date">
          <Input id="fuel-date" name="loggedOn" type="date" required />
        </Field>
        <Field label="Cost" htmlFor="fuel-cost">
          <Input id="fuel-cost" name="cost" type="number" min={0} step="0.01" required />
        </Field>
      </div>
      <Field label="Odometer" htmlFor="fuel-odometer">
        <Input id="fuel-odometer" name="odometer" type="number" min={0} />
      </Field>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Log fuel"}
      </Button>
    </form>
  );
}
