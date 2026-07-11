"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export type WaiverVersionRow = { id: string; versionNumber: number; title: string; createdAt: string };

export function WaiverPanel({
  workspaceId,
  canManage,
  currentVersion,
  versions,
}: {
  workspaceId: string;
  canManage: boolean;
  currentVersion: { title: string; bodyText: string; versionNumber: number } | null;
  versions: WaiverVersionRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function onPublish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "");
    const bodyText = String(form.get("bodyText") ?? "");

    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/waiver-template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, bodyText }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not publish this version.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setError("Could not publish this version. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return currentVersion ? (
      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">
          {currentVersion.title} <span className="text-muted-foreground">(v{currentVersion.versionNumber})</span>
        </p>
        <p className="whitespace-pre-wrap text-muted-foreground">{currentVersion.bodyText}</p>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">No waiver has been published yet.</p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {currentVersion && !editing ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium text-foreground">
            {currentVersion.title} <span className="text-muted-foreground">(current — v{currentVersion.versionNumber})</span>
          </p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{currentVersion.bodyText}</p>
          <Button type="button" size="sm" onClick={() => setEditing(true)}>
            Publish a new version
          </Button>
        </div>
      ) : null}

      {editing || !currentVersion ? (
        <form onSubmit={onPublish} className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-semibold text-foreground">
            {currentVersion ? "Publish a new version" : "Publish your first waiver"}
          </p>
          <p className="text-xs text-muted-foreground">
            Editing creates a new, immutable version — guests who already signed keep the version they actually agreed to.
          </p>
          <Field label="Title" htmlFor="waiver-title">
            <Input id="waiver-title" name="title" defaultValue={currentVersion?.title ?? "Liability Waiver"} required />
          </Field>
          <Field label="Waiver text" htmlFor="waiver-body">
            <textarea
              id="waiver-body"
              name="bodyText"
              rows={10}
              defaultValue={currentVersion?.bodyText ?? ""}
              required
              minLength={20}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              placeholder="I acknowledge the risks associated with…"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Publishing…" : "Publish"}
            </Button>
            {currentVersion ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {versions.length > 1 ? (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Version history</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between py-1.5">
                <span className="text-foreground">
                  v{version.versionNumber} — {version.title}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(version.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
