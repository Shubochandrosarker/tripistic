"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

export type BlackoutRow = {
  id: string;
  tourId: string | null;
  tourTitle: string | null;
  startsOn: string; // YYYY-MM-DD
  endsOn: string;
  reason: string | null;
};

export function BlackoutsPanel({
  workspaceId,
  tourId,
  blackouts,
  canManage,
}: {
  workspaceId: string;
  /** When set, the add form defaults to this tour; workspace-wide rows are still listed. */
  tourId?: string;
  blackouts: BlackoutRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(path: string, init: RequestInit) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "The action failed. Try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("The action failed. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const scope = String(form.get("scope") ?? "tour");
    const ok = await call(`/api/workspaces/${workspaceId}/blackout-dates`, {
      method: "POST",
      body: JSON.stringify({
        tourId: scope === "tour" && tourId ? tourId : undefined,
        startsOn: String(form.get("startsOn") ?? ""),
        endsOn: String(form.get("endsOn") ?? "") || undefined,
        reason: String(form.get("reason") ?? ""),
      }),
    });
    if (ok) formElement.reset();
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {blackouts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No blackout dates. Add ranges (holidays, maintenance, personal time) and slot
          generation will skip them.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {blackouts.map((blackout) => (
            <li key={blackout.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {blackout.startsOn === blackout.endsOn
                    ? blackout.startsOn
                    : `${blackout.startsOn} → ${blackout.endsOn}`}
                </p>
                {blackout.reason ? (
                  <p className="text-xs text-muted-foreground">{blackout.reason}</p>
                ) : null}
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
                {blackout.tourId ? (blackout.tourTitle ?? "This tour") : "All tours"}
              </span>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete blackout"
                  disabled={busy}
                  onClick={() =>
                    call(`/api/workspaces/${workspaceId}/blackout-dates/${blackout.id}`, {
                      method: "DELETE",
                    })
                  }
                >
                  <Trash2 className="size-4 text-red-500" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={onAdd} className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold text-foreground">Add blackout dates</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            New slot generation skips these dates. Existing departures are not auto-cancelled —
            cancel them individually above if needed.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <Field label="From" htmlFor="blackout-start">
              <Input id="blackout-start" name="startsOn" type="date" required />
            </Field>
            <Field label="To (optional)" htmlFor="blackout-end">
              <Input id="blackout-end" name="endsOn" type="date" />
            </Field>
            <Field label="Reason" htmlFor="blackout-reason">
              <Input id="blackout-reason" name="reason" maxLength={200} placeholder="Holiday closure" />
            </Field>
            {tourId ? (
              <Field label="Applies to" htmlFor="blackout-scope">
                <select
                  id="blackout-scope"
                  name="scope"
                  defaultValue="tour"
                  className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  <option value="tour">This tour only</option>
                  <option value="workspace">All tours</option>
                </select>
              </Field>
            ) : (
              <input type="hidden" name="scope" value="workspace" />
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add blackout"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
