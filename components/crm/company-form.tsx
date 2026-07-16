"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { COMPANY_KINDS, COMPANY_KIND_LABELS } from "@/lib/constants";

export function CompanyCreateForm({ workspaceId }: { workspaceId: string }) {
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
      email: String(form.get("email") ?? "").trim() || undefined,
      phone: String(form.get("phone") ?? "").trim() || undefined,
      website: String(form.get("website") ?? "").trim() || undefined,
      country: String(form.get("country") ?? "").trim() || undefined,
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not create this company.");
        return;
      }
      setOpen(false);
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setError("Could not create this company. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Add company
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4 sm:w-96">
      <Field label="Name" htmlFor="co-name">
        <Input id="co-name" name="name" required maxLength={120} placeholder="Blue Horizon Travel" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor="co-kind">
          <Select id="co-kind" name="kind" defaultValue="other">
            {COMPANY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {COMPANY_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country" htmlFor="co-country" hint="2-letter code">
          <Input id="co-country" name="country" maxLength={2} placeholder="US" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Email" htmlFor="co-email">
          <Input id="co-email" name="email" type="email" maxLength={254} />
        </Field>
        <Field label="Phone" htmlFor="co-phone">
          <Input id="co-phone" name="phone" type="tel" maxLength={40} />
        </Field>
      </div>
      <Field label="Website" htmlFor="co-website">
        <Input id="co-website" name="website" type="url" maxLength={300} placeholder="https://" />
      </Field>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Create company"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ArchiveCompanyButton({ workspaceId, companyId, name }: { workspaceId: string; companyId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onArchive() {
    if (!confirm(`Archive "${name}"? This hides it from the directory but keeps history intact.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/companies/${companyId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onArchive} disabled={busy}>
      Archive
    </Button>
  );
}
