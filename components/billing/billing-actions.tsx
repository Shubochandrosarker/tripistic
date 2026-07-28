"use client";

import { useState } from "react";
import { CalendarClock, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type CheckoutInterval = "monthly" | "yearly";

async function redirectFromEndpoint(endpoint: string, body?: unknown, key = "url") {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, string> | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Billing request failed.");
  }
  const url = payload?.[key];
  if (!url) throw new Error("Billing provider did not return a redirect URL.");
  window.location.href = url;
}

export function BillingCheckoutButton({
  planSlug,
  interval,
  disabled,
}: {
  planSlug: string;
  interval: CheckoutInterval;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setBusy(true);
    setError(null);
    try {
      await redirectFromEndpoint(
        "/api/billing/checkout",
        { planSlug, interval },
        "checkoutUrl",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" size="sm" variant="secondary" className="w-full" disabled={busy || disabled} onClick={startCheckout}>
        <CreditCard className="size-3.5" aria-hidden />
        {busy ? "Opening..." : interval === "monthly" ? "Monthly checkout" : "Annual checkout"}
      </Button>
      {error ? <p className="text-xs leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

export function BillingPortalButton({ disabled }: { disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      await redirectFromEndpoint("/api/billing/portal", undefined, "portalUrl");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing portal.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" size="sm" variant="secondary" disabled={busy || disabled} onClick={openPortal}>
        <ExternalLink className="size-3.5" aria-hidden />
        {busy ? "Opening..." : "Manage in Stripe"}
      </Button>
      {error ? <p className="text-xs leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

export function BillingScheduleChangeButton({
  planSlug,
  interval,
  disabled,
}: {
  planSlug: string;
  interval: CheckoutInterval;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function scheduleChange() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const previewResponse = await fetch("/api/billing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, interval }),
      });
      const previewPayload = (await previewResponse.json().catch(() => null)) as
        | { preview?: { amountDue?: number; currency?: string }; error?: string }
        | null;
      if (!previewResponse.ok) {
        throw new Error(previewPayload?.error ?? "Could not preview billing change.");
      }

      const amount = previewPayload?.preview?.amountDue ?? 0;
      const currency = previewPayload?.preview?.currency ?? "USD";
      const formatted = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
      }).format(amount / 100);
      const confirmed = window.confirm(
        `Stripe estimates ${formatted} due for this change. Schedule it for the next renewal?`,
      );
      if (!confirmed) {
        setBusy(false);
        return;
      }

      const scheduleResponse = await fetch("/api/billing/schedule-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug, interval }),
      });
      const schedulePayload = (await scheduleResponse.json().catch(() => null)) as
        | { change?: { effectiveAt?: string; targetPlanName?: string }; error?: string }
        | null;
      if (!scheduleResponse.ok) {
        throw new Error(schedulePayload?.error ?? "Could not schedule billing change.");
      }

      const effectiveAt = schedulePayload?.change?.effectiveAt
        ? new Date(schedulePayload.change.effectiveAt).toLocaleDateString()
        : "the next renewal";
      setSuccess(`Scheduled for ${effectiveAt}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not schedule billing change.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" size="sm" variant="secondary" className="w-full" disabled={busy || disabled} onClick={scheduleChange}>
        <CalendarClock className="size-3.5" aria-hidden />
        {busy ? "Checking..." : interval === "monthly" ? "Schedule monthly" : "Schedule annual"}
      </Button>
      {success ? <p className="text-xs leading-5 text-emerald-600 dark:text-emerald-400">{success}</p> : null}
      {error ? <p className="text-xs leading-5 text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
