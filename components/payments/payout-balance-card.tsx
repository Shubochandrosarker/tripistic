"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

type BalanceAmount = {
  amount: number;
  currency: string;
};

type BalancePayload = {
  balance: {
    available: BalanceAmount[];
    pending: BalanceAmount[];
    instantAvailable: BalanceAmount[];
  };
};

function BalanceList({ label, items }: { label: string; items: BalanceAmount[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No balance reported.</p>
      ) : (
        <ul className="space-y-1 text-sm text-foreground">
          {items.map((item) => (
            <li key={`${label}-${item.currency}`}>{formatMoney(item.amount, item.currency)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PayoutBalanceCard({ canManage, hasAccount }: { canManage: boolean; hasAccount: boolean }) {
  const [balance, setBalance] = useState<BalancePayload["balance"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBalance() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/connect/balance", { method: "GET", cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as (BalancePayload & { error?: string }) | null;
      if (!response.ok || !payload?.balance) {
        throw new Error(payload?.error ?? "Could not load payout balance.");
      }
      setBalance(payload.balance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payout balance.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">Only the workspace owner can view payout balances.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={loadBalance} disabled={busy || !hasAccount}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {balance ? "Refresh balance" : "Load balance"}
        </Button>
        {!hasAccount ? <p className="text-sm text-muted-foreground">Connect Stripe first.</p> : null}
      </div>
      {balance ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <BalanceList label="Available" items={balance.available} />
          <BalanceList label="Pending" items={balance.pending} />
          <BalanceList label="Instant available" items={balance.instantAvailable} />
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
