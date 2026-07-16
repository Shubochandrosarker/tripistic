"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CheckInButton({ workspaceId, bookingId }: { workspaceId: string; bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onCheckIn() {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/bookings/${bookingId}/checkin`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={onCheckIn} disabled={busy}>
      {busy ? "Checking in…" : "Check in"}
    </Button>
  );
}
