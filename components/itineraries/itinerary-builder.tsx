"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ITINERARY_ITEM_TYPES, ITINERARY_ITEM_TYPE_LABELS, type ItineraryItemTypeValue } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";

export type BuilderItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  startTime: string | null;
  costCents: number;
  priceCents: number;
  sortOrder: number;
};

export type BuilderDay = {
  id: string;
  dayNumber: number;
  title: string | null;
  items: BuilderItem[];
};

function ItemRow({
  workspaceId,
  itineraryId,
  item,
  currency,
  canManage,
  isFirst,
  isLast,
}: {
  workspaceId: string;
  itineraryId: string;
  item: BuilderItem;
  currency: string;
  canManage: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function move(direction: "up" | "down") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/itineraries/${itineraryId}/items/${item.id}/reorder`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }) },
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove "${item.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/itineraries/${itineraryId}/items/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {item.startTime ? <span className="font-mono text-xs text-muted-foreground">{item.startTime}</span> : null}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {ITINERARY_ITEM_TYPE_LABELS[item.type as ItineraryItemTypeValue] ?? item.type}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-foreground">{item.title}</p>
        {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cost {formatMoney(item.costCents, currency)} · Price {formatMoney(item.priceCents, currency)}
        </p>
      </div>
      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" disabled={busy || isFirst} onClick={() => move("up")} aria-label="Move up">
            <ArrowUp className="size-3.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" disabled={busy || isLast} onClick={() => move("down")} aria-label="Move down">
            <ArrowDown className="size-3.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={remove} aria-label="Remove item">
            <Trash2 className="size-3.5 text-red-600 dark:text-red-400" aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function AddItemForm({ workspaceId, itineraryId, dayId }: { workspaceId: string; itineraryId: string; dayId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = {
      itineraryDayId: dayId,
      type: String(form.get("type") ?? "other"),
      title: String(form.get("title") ?? "").trim(),
      startTime: String(form.get("startTime") ?? "") || undefined,
      costCents: Math.round(Number(form.get("cost") ?? 0) * 100),
      priceCents: Math.round(Number(form.get("price") ?? 0) * 100),
    };
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/itineraries/${itineraryId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setOpen(false);
        (event.target as HTMLFormElement).reset();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        + Add item
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Select name="type" defaultValue="activity" className="h-8 text-xs">
          {ITINERARY_ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {ITINERARY_ITEM_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Input name="startTime" type="time" className="h-8 text-xs" />
      </div>
      <Input name="title" required maxLength={200} placeholder="Item title" className="h-8 text-xs" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input name="cost" type="number" min={0} step="0.01" placeholder="Cost" className="h-8 text-xs" />
        <Input name="price" type="number" min={0} step="0.01" placeholder="Price" className="h-8 text-xs" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Add"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ItineraryBuilder({
  workspaceId,
  itineraryId,
  days,
  currency,
  canManage,
}: {
  workspaceId: string;
  itineraryId: string;
  days: BuilderDay[];
  currency: string;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h3 className="text-sm font-semibold text-foreground">
            Day {day.dayNumber}
            {day.title ? ` — ${day.title}` : ""}
          </h3>
          {day.items.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No items yet.</p>
          ) : (
            <ul className="mt-1 divide-y divide-border">
              {day.items.map((item, i) => (
                <ItemRow
                  key={item.id}
                  workspaceId={workspaceId}
                  itineraryId={itineraryId}
                  item={item}
                  currency={currency}
                  canManage={canManage}
                  isFirst={i === 0}
                  isLast={i === day.items.length - 1}
                />
              ))}
            </ul>
          )}
          {canManage ? <AddItemForm workspaceId={workspaceId} itineraryId={itineraryId} dayId={day.id} /> : null}
        </div>
      ))}
    </div>
  );
}

export function SaveVersionButton({ workspaceId, itineraryId }: { workspaceId: string; itineraryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    setBusy(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/itineraries/${itineraryId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onSave} disabled={busy}>
        {busy ? "Saving…" : "Save version"}
      </Button>
      {saved ? <span className="text-xs text-muted-foreground">Saved</span> : null}
    </div>
  );
}

export function ItineraryStatusControl({
  workspaceId,
  itineraryId,
  status,
}: {
  workspaceId: string;
  itineraryId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onChange(next: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/itineraries/${itineraryId}`, {
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
    <Select value={status} disabled={busy} onChange={(e) => onChange(e.target.value)} className="h-8 w-auto text-xs">
      <option value="draft">Draft</option>
      <option value="shared">Shared</option>
      <option value="confirmed">Confirmed</option>
      <option value="archived">Archived</option>
    </Select>
  );
}
