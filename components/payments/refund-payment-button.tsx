"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

function idempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `refund-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMinorUnits(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number.parseFloat(normalized) * 100);
}

export function RefundPaymentButton({
  workspaceId,
  paymentId,
  currency,
  refundableAmount,
  canManage,
}: {
  workspaceId: string;
  paymentId: string;
  currency: string;
  refundableAmount: number;
  canManage: boolean;
}) {
  const defaultAmount = useMemo(() => (refundableAmount / 100).toFixed(2), [refundableAmount]);
  const [amount, setAmount] = useState(defaultAmount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitRefund() {
    const minorAmount = toMinorUnits(amount);
    if (!minorAmount || minorAmount <= 0 || minorAmount > refundableAmount) {
      setError(`Enter an amount up to ${formatMoney(refundableAmount, currency)}.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/payments/${paymentId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: minorAmount,
          reason: "requested_by_customer",
          idempotencyKey: idempotencyKey(),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Refund failed.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed.");
      setBusy(false);
    }
  }

  if (!canManage || refundableAmount <= 0) {
    return <span className="text-xs text-muted-foreground">Unavailable</span>;
  }

  return (
    <div className="flex min-w-56 flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          className="h-8 w-24 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-accent"
          inputMode="decimal"
          aria-label="Refund amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={busy}
        />
        <Button type="button" size="sm" variant="secondary" onClick={submitRefund} disabled={busy}>
          <RotateCcw className="size-3.5" aria-hidden />
          {busy ? "Refunding" : "Refund"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Max {formatMoney(refundableAmount, currency)}</p>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
