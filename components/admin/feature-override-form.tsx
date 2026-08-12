"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

/**
 * Temporary per-workspace feature grants.
 *
 * Every grant has an end date, and the form does not offer "never". A support
 * grant with no expiry is a permanent entitlement that nobody wrote down and
 * that no plan explains — the workspace keeps a paid feature indefinitely and
 * the first sign is a billing question nobody can answer.
 *
 * `hasFeature` treats an expired row as absent, so a lapsed grant simply falls
 * back to the plan. Nothing has to run to clean it up.
 */

export type OverrideRow = {
  id: string;
  featureKey: string;
  enabled: boolean;
  expiresAt: string | null;
  expired: boolean;
  reason: string | null;
  grantedBy: string | null;
};

const DURATIONS = [7, 14, 30, 60, 90, 180];

export function FeatureOverrideForm({
  workspaceId,
  featureKeys,
  overrides,
}: {
  workspaceId: string;
  featureKeys: string[];
  overrides: OverrideRow[];
}) {
  const router = useRouter();
  const [featureKey, setFeatureKey] = useState(featureKeys[0] ?? "");
  const [enabled, setEnabled] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const endpoint = `/api/admin/workspaces/${workspaceId}/feature-overrides`;

  async function grant() {
    setBusy("grant");
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey, enabled, expiresInDays, reason }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not create the override.");
        return;
      }
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey: key, reason: reason || "Revoked from the admin console." }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not revoke the override.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";
  const ready = reason.trim().length >= 4;

  return (
    <div className="space-y-5">
      {overrides.length > 0 ? (
        <ul className="space-y-2">
          {overrides.map((override) => (
            <li
              key={override.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium text-foreground">{override.featureKey}</span>
                <span className="ml-2 text-muted-foreground">
                  {override.enabled ? "granted" : "denied"}
                  {override.expired
                    ? " · expired"
                    : override.expiresAt
                      ? ` · until ${formatDateTime(override.expiresAt)}`
                      : " · permanent"}
                </span>
                {override.reason ? (
                  <span className="block text-xs text-muted-foreground">
                    {override.reason}
                    {override.grantedBy ? ` — ${override.grantedBy}` : ""}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => revoke(override.featureKey)}
                className="text-xs text-red-600 hover:underline disabled:opacity-50"
              >
                {busy === override.featureKey ? "Revoking…" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No overrides. This workspace resolves every feature from its plan.
        </p>
      )}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="grid gap-3 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-xs font-medium text-muted-foreground">
          Feature
          <select
            className={inputClass}
            value={featureKey}
            onChange={(event) => setFeatureKey(event.target.value)}
          >
            {featureKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Effect
          <select
            className={inputClass}
            value={enabled ? "grant" : "deny"}
            onChange={(event) => setEnabled(event.target.value === "grant")}
          >
            <option value="grant">Grant</option>
            <option value="deny">Deny (kill switch)</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Expires in
          <select
            className={inputClass}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(Number(event.target.value))}
          >
            {DURATIONS.map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-foreground sm:col-span-2 xl:col-span-1">
          Reason
          <input
            className={inputClass}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Trial extension agreed with sales"
          />
        </label>
        <div className="flex items-end">
          <Button size="sm" disabled={!ready || busy !== null} onClick={grant}>
            {busy === "grant" ? "Saving…" : "Apply override"}
          </Button>
        </div>
      </div>
    </div>
  );
}
