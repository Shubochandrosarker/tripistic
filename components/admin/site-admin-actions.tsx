"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * Destructive platform-admin actions on a tenant site.
 *
 * Every one of them requires a typed reason before the button enables. That is
 * not friction for its own sake: `reason` is a required column on the audit
 * row, and the question that follows a suspension is always "why", asked days
 * later by someone who was not here. A reason captured at the moment of the
 * decision is the only one that is ever accurate.
 */
export function SiteAdminActions({
  siteId,
  status,
  hasEarlierRevision,
}: {
  siteId: string;
  status: string;
  hasEarlierRevision: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string, body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sites/${siteId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, reason }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "That did not work.");
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

  const suspended = status === "suspended";
  const ready = reason.trim().length >= 4;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">
        Reason (recorded in the audit log)
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          placeholder="Abuse report #1234 — phishing content on the homepage"
          className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={suspended ? "primary" : "danger"}
          disabled={!ready || busy !== null}
          onClick={() => act("status", { action: suspended ? "reactivate" : "suspend" }, "status")}
        >
          {busy === "status" ? "Working…" : suspended ? "Reactivate site" : "Suspend site"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!ready || !hasEarlierRevision || busy !== null}
          title={hasEarlierRevision ? undefined : "There is no earlier revision to roll back to."}
          onClick={() => act("rollback", {}, "rollback")}
        >
          {busy === "rollback" ? "Rolling back…" : "Force rollback"}
        </Button>
      </div>

      {!ready ? (
        <p className="text-xs text-muted-foreground">Enter a reason to enable these actions.</p>
      ) : null}
    </div>
  );
}
