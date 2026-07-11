"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Starts a fresh Stripe Checkout Session for a booking whose payment failed or whose session expired. */
export function PaymentRetryButton({ publicToken }: { publicToken: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/bookings/${publicToken}/payment/retry`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; payment?: { checkoutUrl: string | null } }
        | null;
      if (!res.ok || !body?.payment?.checkoutUrl) {
        setError(body?.error ?? "Could not start a new payment attempt. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = body.payment.checkoutUrl;
    } catch {
      setError("Could not start a new payment attempt. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="button" onClick={retry} disabled={busy}>
        {busy ? "Starting…" : "Try payment again"}
      </Button>
    </div>
  );
}
