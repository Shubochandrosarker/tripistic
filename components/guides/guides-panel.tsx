"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { RoleBadge } from "@/components/ui/role-badge";
import type { WorkspaceRoleValue } from "@/lib/constants";
import { initials } from "@/lib/utils";

export type GuideRow = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRoleValue;
  certifications: string[];
  notes: string | null;
};

export function GuidesPanel({
  workspaceId,
  canManage,
  guides,
}: {
  workspaceId: string;
  canManage: boolean;
  guides: GuideRow[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onSave(event: FormEvent<HTMLFormElement>, memberId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const certifications = String(form.get("certifications") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const notes = String(form.get("notes") ?? "");

    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/guides/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certifications, notes: notes || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not save this profile.");
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setError("Could not save this profile. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <ul className="divide-y divide-border">
        {guides.map((guide) => (
          <li key={guide.id} className="py-3">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {initials(guide.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {guide.name}
                  <RoleBadge role={guide.role} />
                </p>
                <p className="truncate text-xs text-muted-foreground">{guide.email}</p>

                {editingId === guide.id ? (
                  <form
                    onSubmit={(event) => onSave(event, guide.id)}
                    className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3"
                  >
                    <Field label="Certifications" htmlFor={`certs-${guide.id}`} hint="Comma-separated">
                      <Input
                        id={`certs-${guide.id}`}
                        name="certifications"
                        defaultValue={guide.certifications.join(", ")}
                        placeholder="Wilderness First Aid, PADI Divemaster"
                      />
                    </Field>
                    <Field label="Notes" htmlFor={`notes-${guide.id}`}>
                      <textarea
                        id={`notes-${guide.id}`}
                        name="notes"
                        defaultValue={guide.notes ?? ""}
                        rows={3}
                        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                        placeholder="Languages, specialties, availability notes…"
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)} disabled={busy}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {guide.certifications.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {guide.certifications.map((cert) => (
                          <span key={cert} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {cert}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No certifications on file.</p>
                    )}
                    {guide.notes ? <p className="text-xs text-muted-foreground">{guide.notes}</p> : null}
                  </div>
                )}
              </div>

              {canManage && editingId !== guide.id ? (
                <Button variant="ghost" size="sm" onClick={() => setEditingId(guide.id)} aria-label={`Edit ${guide.name}`}>
                  <Pencil className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
