"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Template = { key: string; name: string; description: string; pageCount: number };

/**
 * Site creation.
 *
 * The subdomain is deliberately not asked for. `allocateSubdomain` derives one
 * from the name and resolves collisions itself, so the first screen is a name
 * and a template rather than a form with a uniqueness error waiting in it. It
 * can be changed later in Settings, where the consequences of changing a live
 * hostname can be explained properly.
 */
export function SiteCreateForm({
  workspaceId,
  templates,
}: {
  workspaceId: string;
  templates: Template[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), templateKey }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { site?: { id: string }; error?: string }
        | null;

      if (!response.ok || !payload?.site) {
        setError(payload?.error ?? "Could not create the website.");
        setBusy(false);
        return;
      }
      router.push(`/dashboard/sites/${payload.site.id}/editor`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No templates are available for this business type yet.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-medium text-foreground">
        Website name
        <input
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Lisbon Food Walks"
          className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <span className="mt-1 block text-xs font-normal text-muted-foreground">
          Used for the page titles and the default address. You can change both later.
        </span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Starting template</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <label
              key={template.key}
              className={cn(
                "cursor-pointer rounded-lg border p-3 transition-colors",
                templateKey === template.key
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-accent/60",
              )}
            >
              <input
                type="radio"
                name="template"
                value={template.key}
                checked={templateKey === template.key}
                onChange={() => setTemplateKey(template.key)}
                className="sr-only"
              />
              <span className="block text-sm font-medium text-foreground">{template.name}</span>
              <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                {template.description}
              </span>
              <span className="mt-2 block text-[11px] text-muted-foreground">
                {template.pageCount} pages
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Button type="submit" disabled={busy || name.trim().length < 2}>
        {busy ? "Creating…" : "Create website"}
      </Button>
    </form>
  );
}
