"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Generates a real Stripe payment link for a pending, unpaid manual booking — never a fake capture. */
export function PaymentLinkAction({ workspaceId, bookingId }: { workspaceId: string; bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/bookings/${bookingId}/payment-link`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as { error?: string; checkoutUrl?: string } | null;
      if (!res.ok || !body?.checkoutUrl) {
        setError(body?.error ?? "Could not create a payment link.");
        setBusy(false);
        return;
      }
      setUrl(body.checkoutUrl);
      router.refresh();
    } catch {
      setError("Could not create a payment link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {url ? (
        <div className="space-y-1.5">
          <p className="break-all rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">{url}</p>
          <Button type="button" size="sm" variant="secondary" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" disabled={busy} onClick={generate}>
          {busy ? "Generating…" : "Generate payment link"}
        </Button>
      )}
    </div>
  );
}
