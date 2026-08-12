"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { SiteSeo } from "@/lib/sites/schema";

/**
 * Site-wide SEO defaults, with a search-result preview.
 *
 * The preview is not decoration. Title and description have hard length limits
 * in the schema (70 and 180) which correspond roughly to where search engines
 * truncate, and an operator writing to a character counter alone tends to
 * produce copy that reads as truncated even when it fits. Showing the shape of
 * the result makes the constraint legible.
 *
 * `emitLlmsTxt` is off by default and stays an explicit choice: publishing a
 * machine-readable summary of a business's pages is a decision about how that
 * business wants to be consumed, not a default we should make for them.
 */

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function SeoForm({
  workspaceId,
  siteId,
  seo: initialSeo,
  previewOrigin,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  seo: SiteSeo;
  previewOrigin: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [seo, setSeo] = useState<SiteSeo>(initialSeo);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function set<K extends keyof SiteSeo>(key: K, value: SiteSeo[K]) {
    setSeo((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seo }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ tone: "error", text: payload?.error ?? "Could not save." });
        return;
      }
      setMessage({ tone: "ok", text: "SEO saved. Publish to put it live." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  const previewTitle = seo.defaultTitle || "Your website title";
  const previewDescription =
    seo.defaultDescription ||
    "Add a description so search engines and social cards show your own words rather than a fragment of the page.";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
            Default title
            <input
              className={inputClass}
              maxLength={70}
              value={seo.defaultTitle}
              onChange={(event) => set("defaultTitle", event.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {seo.defaultTitle.length}/70 characters
            </span>
          </label>

          <label className="block text-sm font-medium text-foreground">
            Title template
            <input
              className={inputClass}
              maxLength={70}
              value={seo.titleTemplate}
              onChange={(event) => set("titleTemplate", event.target.value)}
              placeholder="%s · Lisbon Food Walks"
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              <code>%s</code> is replaced with each page&apos;s own title.
            </span>
          </label>

          <label className="block text-sm font-medium text-foreground">
            Default description
            <textarea
              className={inputClass}
              rows={3}
              maxLength={180}
              value={seo.defaultDescription}
              onChange={(event) => set("defaultDescription", event.target.value)}
            />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {seo.defaultDescription.length}/180 characters
            </span>
          </label>

          <label className="block text-sm font-medium text-foreground">
            Social share image URL
            <input
              className={inputClass}
              value={seo.socialImageUrl}
              onChange={(event) => set("socialImageUrl", event.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Search result
            </p>
            <p className="mt-2 truncate text-xs text-emerald-700 dark:text-emerald-400">
              {previewOrigin}
            </p>
            <p className="truncate text-base text-blue-700 dark:text-blue-400">{previewTitle}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{previewDescription}</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Social card
            </p>
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              {seo.socialImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- an arbitrary operator-supplied URL, not a managed asset.
                <img src={seo.socialImageUrl} alt="" className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 items-center justify-center bg-muted text-xs text-muted-foreground">
                  No share image set
                </div>
              )}
              <div className="p-3">
                <p className="truncate text-sm font-medium text-foreground">{previewTitle}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{previewDescription}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium text-foreground">Structured data</legend>
        <p className="text-xs text-muted-foreground">
          LocalBusiness markup is only emitted when there is a real name and place to put in it.
          Incomplete markup is worse than none — search engines ignore it and may distrust the rest.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium text-foreground">
            Organisation name
            <input
              className={inputClass}
              maxLength={120}
              value={seo.organizationName}
              onChange={(event) => set("organizationName", event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            City
            <input
              className={inputClass}
              maxLength={120}
              value={seo.addressLocality}
              onChange={(event) => set("addressLocality", event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-foreground">
            Country code
            <input
              className={inputClass}
              maxLength={2}
              value={seo.addressCountry}
              onChange={(event) => set("addressCountry", event.target.value.toUpperCase())}
              placeholder="PT"
            />
          </label>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={seo.emitLlmsTxt}
          onChange={(event) => set("emitLlmsTxt", event.target.checked)}
        />
        <span>
          Publish an <code>llms.txt</code> summary
          <span className="mt-0.5 block text-xs text-muted-foreground">
            A machine-readable index of your pages for AI assistants. Off by default; never included
            in preview builds.
          </span>
        </span>
      </label>

      {message ? (
        <p className={message.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}

      <Button onClick={save} disabled={!canManage || busy}>
        {busy ? "Saving…" : "Save SEO"}
      </Button>
    </div>
  );
}
