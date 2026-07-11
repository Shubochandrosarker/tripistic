"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { CONSENT_STATUSES, CONSENT_STATUS_LABELS } from "@/lib/constants";

export function CustomerEditPanel({
  workspaceId,
  customerId,
  name,
  phone,
  country,
  tags,
  consentStatus,
  notes,
}: {
  workspaceId: string;
  customerId: string;
  name: string;
  phone: string | null;
  country: string | null;
  tags: string[];
  consentStatus: string;
  notes: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    const form = new FormData(event.currentTarget);
    const tagsValue = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      name: String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim() || undefined,
      country: String(form.get("country") ?? "").trim() || undefined,
      tags: tagsValue,
      consentStatus: String(form.get("consentStatus") ?? ""),
      notes: String(form.get("notes") ?? "").trim() || undefined,
    };

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save changes. Try again.");
        setBusy(false);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not save changes. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Name" htmlFor="c-name">
        <Input id="c-name" name="name" defaultValue={name} maxLength={100} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Phone" htmlFor="c-phone">
          <Input id="c-phone" name="phone" type="tel" defaultValue={phone ?? ""} maxLength={40} />
        </Field>
        <Field label="Country" htmlFor="c-country" hint="2-letter code, e.g. US">
          <Input id="c-country" name="country" defaultValue={country ?? ""} maxLength={2} />
        </Field>
      </div>
      <Field label="Tags" htmlFor="c-tags" hint="Comma-separated, e.g. VIP, repeat guest">
        <Input id="c-tags" name="tags" defaultValue={tags.join(", ")} maxLength={400} />
      </Field>
      <Field label="Marketing consent" htmlFor="c-consent" hint="Confirmations and reminders always send regardless of this setting.">
        <Select id="c-consent" name="consentStatus" defaultValue={consentStatus}>
          {CONSENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {CONSENT_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Notes" htmlFor="c-notes" hint="Internal only — never shown to the guest.">
        <textarea
          id="c-notes"
          name="notes"
          rows={3}
          maxLength={2000}
          defaultValue={notes ?? ""}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </Field>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
        {saved ? <span className="text-xs text-muted-foreground">Saved</span> : null}
      </div>
    </form>
  );
}
