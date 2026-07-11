"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const NEXT_STEPS: Record<string, { toStatus: string; label: string; variant: "primary" | "secondary" | "danger" }[]> = {
  pending: [
    { toStatus: "confirmed", label: "Confirm", variant: "primary" },
    { toStatus: "cancelled", label: "Cancel booking", variant: "danger" },
  ],
  confirmed: [
    { toStatus: "completed", label: "Mark completed", variant: "secondary" },
    { toStatus: "no_show", label: "Mark no-show", variant: "secondary" },
    { toStatus: "cancelled", label: "Cancel booking", variant: "danger" },
  ],
  cancelled: [],
  completed: [],
  no_show: [],
};

export function BookingStatusActions({
  workspaceId,
  bookingId,
  currentStatus,
}: {
  workspaceId: string;
  bookingId: string;
  currentStatus: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function transition(toStatus: string, note?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/bookings/${bookingId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus, note }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "That status change failed. Try again.");
        setBusy(false);
        return;
      }
      // A full reload (rather than router.refresh()) guarantees every part
      // of the page — status badge, available next actions, status
      // history — reflects the new state from one consistent server
      // response, with no dependency on tracking a client-router
      // transition's completion. `busy` intentionally stays true (and the
      // dialog open) until the new page has fully loaded.
      window.location.reload();
    } catch {
      setError("That status change failed. Check your connection and try again.");
      setBusy(false);
    }
  }

  const steps = NEXT_STEPS[currentStatus] ?? [];
  if (steps.length === 0) {
    return <p className="text-sm text-muted-foreground">This booking is in a final state.</p>;
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {steps.map((step) =>
          step.toStatus === "cancelled" ? (
            <Button
              key={step.toStatus}
              type="button"
              variant={step.variant}
              size="sm"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              {step.label}
            </Button>
          ) : (
            <Button
              key={step.toStatus}
              type="button"
              variant={step.variant}
              size="sm"
              disabled={busy}
              onClick={() => transition(step.toStatus)}
            >
              {step.label}
            </Button>
          ),
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this booking?"
        description="This releases the reserved seats back to the departure immediately. This cannot be undone from here."
        confirmLabel="Cancel booking"
        danger
        busy={busy}
        onConfirm={() => transition("cancelled")}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
