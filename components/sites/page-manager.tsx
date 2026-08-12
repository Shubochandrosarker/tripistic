"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lock, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Page list and page-level SEO.
 *
 * Template pages carry a `systemKey` and are editable but not deletable, and
 * their path is fixed. That is not paternalism: the generated Worker routes to
 * those exact paths, and letting `/tours` move would break the route with no
 * signal until a visitor hit a 404. The UI says so rather than silently
 * disabling the control.
 */

export type ManagedPage = {
  id: string;
  path: string;
  title: string;
  enabled: boolean;
  systemKey: string | null;
  seo: { title: string; description: string; noindex: boolean };
};

const inputClass =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function PageManager({
  workspaceId,
  siteId,
  pages,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  pages: ManagedPage[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newPath, setNewPath] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function request(url: string, method: string, body?: unknown, key = url) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "That did not work.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const base = `/api/workspaces/${workspaceId}/sites/${siteId}/pages`;

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ul className="space-y-2">
        {pages.map((page) => (
          <li key={page.id} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {page.title}
                  {page.systemKey ? (
                    <Lock
                      aria-label="Part of the template — editable but the address is fixed"
                      className="h-3 w-3 text-muted-foreground"
                    />
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{page.path}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={page.enabled}
                    disabled={!canManage || busy !== null}
                    onChange={(event) =>
                      request(`${base}/${page.id}`, "PATCH", { enabled: event.target.checked }, page.id)
                    }
                  />
                  Enabled
                </label>
                <Link
                  href={`/dashboard/sites/${siteId}/editor`}
                  className="text-xs text-accent hover:underline"
                >
                  Edit content
                </Link>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === page.id ? null : page.id)}
                  aria-expanded={expanded === page.id}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  SEO
                </button>
                <button
                  type="button"
                  disabled={!canManage || Boolean(page.systemKey) || page.path === "/" || busy !== null}
                  onClick={() => request(`${base}/${page.id}`, "DELETE", undefined, page.id)}
                  aria-label={`Delete ${page.title}`}
                  title={
                    page.systemKey
                      ? "Template pages can be disabled but not deleted."
                      : page.path === "/"
                        ? "The homepage cannot be deleted."
                        : undefined
                  }
                  className="rounded p-1 text-muted-foreground hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 aria-hidden className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {expanded === page.id ? (
              <PageSeoEditor
                page={page}
                disabled={!canManage || busy !== null}
                onSave={(seo) => request(`${base}/${page.id}`, "PATCH", { seo }, page.id)}
              />
            ) : null}
          </li>
        ))}
      </ul>

      {canManage ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const created = await request(
              base,
              "POST",
              { title: newTitle.trim(), path: newPath.trim() },
              "create",
            );
            if (created) {
              setNewTitle("");
              setNewPath("");
            }
          }}
        >
          <label className="text-xs font-medium text-muted-foreground">
            Page title
            <input
              required
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="Private groups"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Path
            <input
              required
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              className={`mt-1 ${inputClass}`}
              placeholder="/private-groups"
            />
          </label>
          <Button type="submit" size="sm" disabled={busy !== null}>
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add page
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function PageSeoEditor({
  page,
  disabled,
  onSave,
}: {
  page: ManagedPage;
  disabled: boolean;
  onSave: (seo: ManagedPage["seo"]) => void;
}) {
  const [seo, setSeo] = useState(page.seo);

  return (
    <div className="space-y-3 border-t border-border bg-muted/30 p-3">
      <label className="block text-xs font-medium text-muted-foreground">
        Page title
        <input
          className={`mt-1 ${inputClass}`}
          maxLength={70}
          value={seo.title}
          onChange={(event) => setSeo({ ...seo, title: event.target.value })}
          placeholder="Leave empty to use the site template"
        />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Description
        <textarea
          className={`mt-1 ${inputClass}`}
          rows={2}
          maxLength={180}
          value={seo.description}
          onChange={(event) => setSeo({ ...seo, description: event.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-foreground">
        <input
          type="checkbox"
          checked={seo.noindex}
          onChange={(event) => setSeo({ ...seo, noindex: event.target.checked })}
        />
        Ask search engines not to index this page
      </label>
      <Button size="sm" disabled={disabled} onClick={() => onSave(seo)}>
        Save page SEO
      </Button>
    </div>
  );
}
