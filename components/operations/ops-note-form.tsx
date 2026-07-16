"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function OpsNoteForm({ workspaceId, availabilityId }: { workspaceId: string; availabilityId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const message = String(form.get("message") ?? "").trim();
    if (!message) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/operations/availabilities/${availabilityId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save this note.");
        return;
      }
      (event.target as HTMLFormElement).reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <Input name="message" placeholder="Add an internal note…" maxLength={2000} />
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Add"}
      </Button>
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </form>
  );
}
