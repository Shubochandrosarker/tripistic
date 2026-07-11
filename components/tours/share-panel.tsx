"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SharePanel({ workspaceSlug, tourSlug }: { workspaceSlug: string; tourSlug: string }) {
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const bookingUrl = `${origin}/book/${workspaceSlug}/${tourSlug}`;
  const embedUrl = `${origin}/embed/${workspaceSlug}/${tourSlug}`;
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="900" style="border:0" title="Book now"></iframe>`;

  async function copy(text: string, which: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the text is still selectable/visible.
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-foreground">Public booking link</p>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={bookingUrl}
            className="h-9 w-full rounded-lg border border-border bg-muted/40 px-3 text-sm text-foreground"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => copy(bookingUrl, "link")}>
            {copied === "link" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied === "link" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Embed on your website</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Paste this snippet anywhere on your site.</p>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <textarea
            readOnly
            value={iframeSnippet}
            rows={2}
            className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => copy(iframeSnippet, "embed")}>
            {copied === "embed" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied === "embed" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
