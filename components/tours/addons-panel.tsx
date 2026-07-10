"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatMoney } from "@/lib/utils";

export type AddonRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  maxPerBooking: number | null;
  isActive: boolean;
};

export function AddonsPanel({
  workspaceId,
  tourId,
  currency,
  addons,
  canManage,
}: {
  workspaceId: string;
  tourId: string;
  currency: string;
  addons: AddonRow[];
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
    const priceMajor = parseFloat(String(form.get("price") ?? "0"));
    const ok = await call(`/api/workspaces/${workspaceId}/tours/${tourId}/addons`, {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        price: Number.isFinite(priceMajor) ? Math.round(priceMajor * 100) : -1,
        maxPerBooking: String(form.get("maxPerBooking") ?? ""),
      }),
    });
    if (ok) formElement.reset();
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {addons.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No add-ons yet. Add extras guests can purchase with a booking — photos, gear rental,
          hotel pickup, food upgrades.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {addons.map((addon) => (
            <li key={addon.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{addon.name}</p>
                {addon.description ? (
                  <p className="truncate text-xs text-muted-foreground">{addon.description}</p>
                ) : null}
              </div>
              <span className="text-sm text-foreground">{formatMoney(addon.price, currency)}</span>
              {addon.maxPerBooking ? (
                <span className="text-xs text-muted-foreground">max {addon.maxPerBooking}</span>
              ) : null}
              {!addon.isActive ? <StatusBadge status="inactive" /> : null}
              {canManage ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      call(`/api/workspaces/${workspaceId}/tours/${tourId}/addons/${addon.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ isActive: !addon.isActive }),
                      })
                    }
                  >
                    {addon.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${addon.name}`}
                    disabled={busy}
                    onClick={() =>
                      call(`/api/workspaces/${workspaceId}/tours/${tourId}/addons/${addon.id}`, {
                        method: "DELETE",
                      })
                    }
                  >
                    <Trash2 className="size-4 text-red-500" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form onSubmit={onAdd} className="rounded-lg border border-border bg-muted/40 p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <Field label="Add-on name" htmlFor="addon-name">
              <Input id="addon-name" name="name" placeholder="Photo package" minLength={2} maxLength={120} required />
            </Field>
            <Field label={`Price (${currency})`} htmlFor="addon-price">
              <Input id="addon-price" name="price" type="number" min={0} step="0.01" defaultValue="10.00" required />
            </Field>
            <Field label="Max per booking" htmlFor="addon-max">
              <Input id="addon-max" name="maxPerBooking" type="number" min={1} max={100} placeholder="—" />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
          <input type="hidden" name="description" value="" />
        </form>
      ) : null}
    </div>
  );
}
