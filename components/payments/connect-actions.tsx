"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

async function postForRedirect(endpoint: string, key: string) {
  const response = await fetch(endpoint, { method: "POST" });
  const payload = (await response.json().catch(() => null)) as Record<string, string> | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Stripe Connect request failed.");
  }
  const url = payload?.[key];
  if (!url) throw new Error("Stripe did not return a redirect URL.");
  window.location.href = url;
}

export function ConnectActions({
  canManage,
  hasAccount,
}: {
  canManage: boolean;
  hasAccount: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "onboarding" | "refresh" | "login") {
    setBusy(action);
    setError(null);
    try {
      if (action === "onboarding") {
        await postForRedirect("/api/payments/connect/onboarding", "onboardingUrl");
        return;
      }
      if (action === "login") {
        await postForRedirect("/api/payments/connect/login", "loginUrl");
        return;
      }
      const response = await fetch("/api/payments/connect/refresh", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Could not refresh payout status.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stripe Connect request failed.");
      setBusy(null);
    }
  }

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">Only the workspace owner can manage payouts.</p>;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button type="button" variant="accent" onClick={() => run("onboarding")} disabled={busy !== null}>
        <ExternalLink className="size-4" aria-hidden />
        {busy === "onboarding" ? "Opening..." : hasAccount ? "Continue onboarding" : "Connect Stripe"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => run("refresh")} disabled={busy !== null || !hasAccount}>
        <RefreshCw className="size-4" aria-hidden />
        {busy === "refresh" ? "Refreshing..." : "Refresh status"}
      </Button>
      <Button type="button" variant="secondary" onClick={() => run("login")} disabled={busy !== null || !hasAccount}>
        <ExternalLink className="size-4" aria-hidden />
        {busy === "login" ? "Opening..." : "Stripe dashboard"}
      </Button>
      {error ? <p className="basis-full text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
