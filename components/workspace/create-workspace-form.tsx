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

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      businessType: String(form.get("businessType") ?? "solo_guide"),
      timezone: String(form.get("timezone") ?? "UTC"),
      currency: String(form.get("currency") ?? "USD"),
      country: String(form.get("country") ?? ""),
    };

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not create the workspace. Try again.");
        setBusy(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not create the workspace. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Business name"
        htmlFor="name"
        hint="Shown to your team and, later, on your booking page."
      >
        <Input
          id="name"
          name="name"
          placeholder="Sunset Desert Tours"
          minLength={2}
          maxLength={80}
          required
        />
      </Field>

      <Field label="Business type" htmlFor="businessType">
        <Select id="businessType" name="businessType" defaultValue="solo_guide" required>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Timezone" htmlFor="timezone">
          <Select id="timezone" name="timezone" defaultValue="UTC" required>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Currency" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue="USD" required>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Country" htmlFor="country">
        <Select id="country" name="country" defaultValue="">
          <option value="">Select a country (optional)</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </Select>
      </Field>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creating workspace…" : "Create workspace"}
      </Button>
    </form>
  );
}
