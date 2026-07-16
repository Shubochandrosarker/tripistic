"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/constants";

export function VehicleCreateForm({ workspaceId }: { workspaceId: string }) {
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
      type: String(form.get("type") ?? "car"),
      licensePlate: String(form.get("licensePlate") ?? "").trim() || undefined,
      capacity: Number(form.get("capacity") ?? 4),
      insuranceExpiresOn: String(form.get("insuranceExpiresOn") ?? "") || undefined,
      registrationExpiresOn: String(form.get("registrationExpiresOn") ?? "") || undefined,
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not add this vehicle.");
        return;
      }
      setOpen(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError("Could not add this vehicle. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add vehicle
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-96">
      <Field label="Name" htmlFor="veh-name">
        <Input id="veh-name" name="name" required maxLength={120} placeholder="Ford Transit #2" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="veh-type">
          <Select id="veh-type" name="type" defaultValue="car">
            {VEHICLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {VEHICLE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Capacity" htmlFor="veh-capacity">
          <Input id="veh-capacity" name="capacity" type="number" min={1} defaultValue={4} required />
        </Field>
      </div>
      <Field label="License plate" htmlFor="veh-plate">
        <Input id="veh-plate" name="licensePlate" maxLength={20} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Insurance expires" htmlFor="veh-insurance">
          <Input id="veh-insurance" name="insuranceExpiresOn" type="date" />
        </Field>
        <Field label="Registration expires" htmlFor="veh-registration">
          <Input id="veh-registration" name="registrationExpiresOn" type="date" />
        </Field>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Add vehicle"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
