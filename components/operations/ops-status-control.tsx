"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OPS_STATUS_LABELS, OPS_STATUS_TRANSITIONS, type OpsStatusValue } from "@/lib/constants";

export function OpsStatusControl({
  workspaceId,
  availabilityId,
  status,
}: {
  workspaceId: string;
  availabilityId: string;
  status: OpsStatusValue;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextOptions = OPS_STATUS_TRANSITIONS[status] ?? [];

  async function onTransition(next: OpsStatusValue) {
    let delayMinutes: number | undefined;
    let notifyGuests = false;
    if (next === "delayed") {
      const raw = prompt("Delay in minutes (optional):", "15");
      if (raw === null) return;
      delayMinutes = raw.trim() ? Number(raw) : undefined;
      notifyGuests = confirm("Notify confirmed guests by email about this delay?");
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/operations/availabilities/${availabilityId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, delayMinutes, notifyGuests }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not update status.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (nextOptions.length === 0) {
    return <span className="text-xs text-muted-foreground">No further transitions</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {nextOptions.map((option) => (
          <Button
            key={option}
            size="sm"
            variant={option === "cancelled" ? "danger" : "secondary"}
            disabled={busy}
            onClick={() => onTransition(option)}
          >
            {OPS_STATUS_LABELS[option]}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
