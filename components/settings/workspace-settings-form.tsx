"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  COUNTRIES,
  CURRENCIES,
  TIMEZONES,
} from "@/lib/constants";

export function WorkspaceSettingsForm({
  workspace,
  canEdit,
}: {
  workspace: {
    id: string;
    name: string;
    businessType: string;
    timezone: string;
    currency: string;
    country: string | null;
  };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      businessType: String(form.get("businessType") ?? ""),
      timezone: String(form.get("timezone") ?? ""),
      currency: String(form.get("currency") ?? ""),
      country: String(form.get("country") ?? ""),
    };

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save changes.");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Could not save changes. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Workspace name" htmlFor="ws-name">
        <Input
          id="ws-name"
          name="name"
          defaultValue={workspace.name}
          minLength={2}
          maxLength={80}
          required
          disabled={!canEdit}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business type" htmlFor="ws-businessType">
          <Select
            id="ws-businessType"
            name="businessType"
            defaultValue={workspace.businessType}
            disabled={!canEdit}
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type} value={type}>
                {BUSINESS_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country" htmlFor="ws-country">
          <Select
            id="ws-country"
            name="country"
            defaultValue={workspace.country ?? ""}
            disabled={!canEdit}
          >
            <option value="">Not set</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Timezone" htmlFor="ws-timezone">
          <Select
            id="ws-timezone"
            name="timezone"
            defaultValue={workspace.timezone}
            disabled={!canEdit}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="ws-currency">
          <Select
            id="ws-currency"
            name="currency"
            defaultValue={workspace.currency}
            disabled={!canEdit}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {saved ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Changes saved.</p>
      ) : null}

      {canEdit ? (
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only workspace owners and admins can edit these settings.
        </p>
      )}
    </form>
  );
}
