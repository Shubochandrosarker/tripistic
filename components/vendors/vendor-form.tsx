"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { VENDOR_KINDS, VENDOR_KIND_LABELS } from "@/lib/constants";

export function VendorCreateForm({ workspaceId }: { workspaceId: string }) {
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
      kind: String(form.get("kind") ?? "other"),
      contactName: String(form.get("contactName") ?? "").trim() || undefined,
      email: String(form.get("email") ?? "").trim() || undefined,
      phone: String(form.get("phone") ?? "").trim() || undefined,
      country: String(form.get("country") ?? "").trim() || undefined,
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not add this vendor.");
        return;
      }
      setOpen(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError("Could not add this vendor. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add vendor
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-96">
      <Field label="Name" htmlFor="ven-name">
        <Input id="ven-name" name="name" required maxLength={120} placeholder="Riverside Lodge" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="ven-kind">
          <Select id="ven-kind" name="kind" defaultValue="other">
            {VENDOR_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {VENDOR_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country" htmlFor="ven-country" hint="2-letter code">
          <Input id="ven-country" name="country" maxLength={2} placeholder="TH" />
        </Field>
      </div>
      <Field label="Contact name" htmlFor="ven-contact">
        <Input id="ven-contact" name="contactName" maxLength={120} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="ven-email">
          <Input id="ven-email" name="email" type="email" maxLength={254} />
        </Field>
        <Field label="Phone" htmlFor="ven-phone">
          <Input id="ven-phone" name="phone" type="tel" maxLength={40} />
        </Field>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Add vendor"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function InvoiceCreateForm({ workspaceId, vendorId }: { workspaceId: string; vendorId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      invoiceNumber: String(form.get("invoiceNumber") ?? "").trim() || undefined,
      amountCents: Math.round(Number(form.get("amount") ?? 0) * 100),
      issuedOn: String(form.get("issuedOn") ?? ""),
      dueOn: String(form.get("dueOn") ?? "") || undefined,
    };
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vendors/${vendorId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not add this invoice.");
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
        <Field label="Invoice #" htmlFor="inv-number">
          <Input id="inv-number" name="invoiceNumber" maxLength={80} />
        </Field>
        <Field label="Amount" htmlFor="inv-amount">
          <Input id="inv-amount" name="amount" type="number" min={0} step="0.01" required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Issued" htmlFor="inv-issued">
          <Input id="inv-issued" name="issuedOn" type="date" required />
        </Field>
        <Field label="Due" htmlFor="inv-due">
          <Input id="inv-due" name="dueOn" type="date" />
        </Field>
      </div>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Add invoice"}
      </Button>
    </form>
  );
}

export function MarkInvoicePaidButton({ workspaceId, vendorId, invoiceId, status }: { workspaceId: string; vendorId: string; invoiceId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onMarkPaid() {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/vendors/${vendorId}/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === "paid" || status === "cancelled") return null;

  return (
    <Button size="sm" variant="secondary" onClick={onMarkPaid} disabled={busy}>
      {busy ? "Saving…" : "Mark paid"}
    </Button>
  );
}
