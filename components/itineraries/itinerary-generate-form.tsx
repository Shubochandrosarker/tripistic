"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { ITINERARY_MAX_DAYS } from "@/lib/constants";

export function ItineraryGenerateForm({ workspaceId }: { workspaceId: string }) {
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
      title: String(form.get("title") ?? "").trim(),
      destination: String(form.get("destination") ?? "").trim() || undefined,
      dayCount: Number(form.get("dayCount") ?? 5),
      travelerCount: Number(form.get("travelerCount") ?? 2),
      budgetTier: String(form.get("budgetTier") ?? "standard"),
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/itineraries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not generate this itinerary.");
        return;
      }
      const body = (await res.json()) as { itinerary: { id: string } };
      router.push(`/dashboard/itineraries/${body.itinerary.id}`);
    } catch {
      setError("Could not generate this itinerary. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" aria-hidden /> Build itinerary
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-[26rem]">
      <Field label="Title" htmlFor="it-title" hint='e.g. "9 Day Laos Explorer"'>
        <Input id="it-title" name="title" required maxLength={160} placeholder="9 Day Laos Explorer" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Destination" htmlFor="it-destination">
          <Input id="it-destination" name="destination" maxLength={160} placeholder="Laos" />
        </Field>
        <Field label="Days" htmlFor="it-days">
          <Input id="it-days" name="dayCount" type="number" min={1} max={ITINERARY_MAX_DAYS} defaultValue={9} required />
        </Field>
        <Field label="Travelers" htmlFor="it-travelers">
          <Input id="it-travelers" name="travelerCount" type="number" min={1} defaultValue={2} />
        </Field>
      </div>
      <Field label="Budget tier" htmlFor="it-tier">
        <Select id="it-tier" name="budgetTier" defaultValue="standard">
          <option value="budget">Budget</option>
          <option value="standard">Standard</option>
          <option value="premium">Premium</option>
        </Select>
      </Field>
      <p className="text-xs text-muted-foreground">
        Builds a full day-by-day plan from your own tour catalog and vendor directory, with pricing and margin — fully editable after.
      </p>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Generating…" : "Generate"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
