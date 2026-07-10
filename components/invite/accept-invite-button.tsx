"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not accept the invitation.");
        setBusy(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not accept the invitation. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button className="w-full" onClick={accept} disabled={busy}>
        {busy ? "Joining…" : "Accept invitation"}
      </Button>
    </div>
  );
}
