"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TZDate } from "@date-fns/tz";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";
import { formatDateTimeInTz, formatMoney } from "@/lib/utils";

export type AvailabilityRow = {
  id: string;
  startsAt: string; // ISO
  endsAt: string;
  capacity: number;
  bookedCount: number;
  priceOverride: number | null;
  status: string;
  scheduleId: string | null;
  guideId: string | null;
  guideName: string | null;
};

export type GuideOption = { id: string; name: string };

export function AvailabilityPanel({
  workspaceId,
  tourId,
  timezone,
  currency,
  basePrice,
  availabilities,
  canManage,
  guideOptions,
}: {
  workspaceId: string;
  tourId: string;
  timezone: string;
  currency: string;
  basePrice: number;
  availabilities: AvailabilityRow[];
  canManage: boolean;
  guideOptions: GuideOption[];
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
    const date = String(form.get("date") ?? "");
    const time = String(form.get("time") ?? "");
    if (!date || !time) {
      setError("Pick a date and a time.");
      return;
    }
    // Compose the instant in the WORKSPACE timezone (not the browser's).
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const instant = new TZDate(year, month - 1, day, hour, minute, 0, timezone);

    const capacityRaw = String(form.get("capacity") ?? "");
    const priceRaw = String(form.get("priceOverride") ?? "");

    const ok = await call(`/api/workspaces/${workspaceId}/tours/${tourId}/availabilities`, {
      method: "POST",
      body: JSON.stringify({
        startsAt: new Date(instant.getTime()).toISOString(),
        capacity: capacityRaw,
        priceOverride: priceRaw
          ? Math.round(parseFloat(priceRaw) * 100)
          : undefined,
        guideId: String(form.get("guideId") ?? "") || undefined,
      }),
    });
    if (ok) formElement.reset();
  }

  function onGuideChange(availabilityId: string, guideId: string) {
    call(`/api/workspaces/${workspaceId}/tours/${tourId}/availabilities/${availabilityId}`, {
      method: "PATCH",
      body: JSON.stringify({ guideId: guideId || null }),
    });
  }

  const now = Date.now();

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <TableShell
        headers={["Departure", "Capacity", "Booked", "Price", "Guide", "Source", "Status", ""]}
        isEmpty={availabilities.length === 0}
        emptyMessage="No upcoming departures. Add a recurring schedule above or create a one-off departure below."
        className="border-0 shadow-none"
      >
        {availabilities.map((slot) => {
          const cancellable =
            canManage && slot.status === "scheduled" && Date.parse(slot.startsAt) > now;
          return (
            <tr key={slot.id}>
              <Td className="font-medium">{formatDateTimeInTz(slot.startsAt, timezone)}</Td>
              <Td className="text-muted-foreground">{slot.capacity}</Td>
              <Td className="text-muted-foreground">{slot.bookedCount}</Td>
              <Td className="text-muted-foreground">
                {formatMoney(slot.priceOverride ?? basePrice, currency)}
                {slot.priceOverride !== null ? (
                  <span className="ml-1 text-xs">(override)</span>
                ) : null}
              </Td>
              <Td className="text-muted-foreground">
                {canManage ? (
                  <Select
                    aria-label="Assigned guide"
                    className="h-8 w-36 text-xs"
                    defaultValue={slot.guideId ?? ""}
                    disabled={busy}
                    onChange={(event) => onGuideChange(slot.id, event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {guideOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  (slot.guideName ?? "Unassigned")
                )}
              </Td>
              <Td className="text-muted-foreground">{slot.scheduleId ? "Schedule" : "One-off"}</Td>
              <Td>
                <StatusBadge status={slot.status} />
              </Td>
              <Td>
                {cancellable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      call(
                        `/api/workspaces/${workspaceId}/tours/${tourId}/availabilities/${slot.id}`,
                        { method: "DELETE" },
                      )
                    }
                  >
                    Cancel
                  </Button>
                ) : null}
              </Td>
            </tr>
          );
        })}
      </TableShell>

      {canManage ? (
        <form onSubmit={onAdd} className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold text-foreground">Add a one-off departure</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <Field label="Date" htmlFor="slot-date">
              <Input id="slot-date" name="date" type="date" required />
            </Field>
            <Field label={`Time (${timezone})`} htmlFor="slot-time">
              <Input id="slot-time" name="time" type="time" required />
            </Field>
            <Field label="Capacity" htmlFor="slot-capacity">
              <Input id="slot-capacity" name="capacity" type="number" min={1} max={1000} placeholder="tour default" />
            </Field>
            <Field label={`Price override (${currency})`} htmlFor="slot-price">
              <Input id="slot-price" name="priceOverride" type="number" min={0} step="0.01" placeholder="base price" />
            </Field>
            <Field label="Guide" htmlFor="slot-guide">
              <Select id="slot-guide" name="guideId" defaultValue="">
                <option value="">Unassigned</option>
                {guideOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add departure"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
