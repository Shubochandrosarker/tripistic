"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Rocket, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

type Revision = { id: string; versionNumber: number; note: string | null; createdAt: string };

type Deployment = {
  id: string;
  status: string;
  liveUrl: string | null;
  previewUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
};

/**
 * Publish, preview and rollback.
 *
 * Deliberately three separate buttons rather than one "save and publish". The
 * live site is what a business's customers see, and an accidental publish of a
 * half-finished edit is a real cost — so publishing is always an explicit act,
 * never a side effect of editing.
 *
 * A failed publish returns 200 with a failure body, not a 5xx: nothing went
 * wrong with the request, the previous deployment is still serving, and the
 * only correct thing to show is the error plus a retry.
 */
export function PublishPanel({
  workspaceId,
  siteId,
  revisions,
  deployments,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  revisions: Revision[];
  deployments: Deployment[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"publish" | "preview" | string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function call(url: string, body: unknown, kind: string) {
    setBusy(kind);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { result?: { status?: string; message?: string; liveUrl?: string | null }; error?: string }
        | null;

      if (!response.ok) {
        setMessage({ tone: "error", text: payload?.error ?? "That did not work." });
        return;
      }
      const result = payload?.result;
      setMessage({
        tone: result?.status === "failed" ? "error" : "ok",
        text: result?.message ?? "Done.",
      });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  const live = deployments.find((deployment) => deployment.status === "live");
  // The rollback target is the revision behind the one currently live. Offering
  // the live revision itself would be a no-op dressed up as a recovery action.
  const rollbackTarget = revisions[1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={!canManage || busy !== null}
          onClick={() => call(`/api/workspaces/${workspaceId}/sites/${siteId}/publish`, {}, "publish")}
        >
          <Rocket aria-hidden className="h-4 w-4" />
          {busy === "publish" ? "Publishing…" : "Publish"}
        </Button>
        <Button
          variant="secondary"
          disabled={!canManage || busy !== null}
          onClick={() =>
            call(`/api/workspaces/${workspaceId}/sites/${siteId}/publish`, { preview: true }, "preview")
          }
        >
          {busy === "preview" ? "Building…" : "Build preview"}
        </Button>
        {rollbackTarget ? (
          <Button
            variant="secondary"
            disabled={!canManage || busy !== null}
            onClick={() =>
              call(
                `/api/workspaces/${workspaceId}/sites/${siteId}/rollback`,
                { revisionId: rollbackTarget.id },
                "rollback",
              )
            }
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            Roll back to v{rollbackTarget.versionNumber}
          </Button>
        ) : null}
        {live?.liveUrl ? (
          <a
            href={live.liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
          >
            View live site
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      {message ? (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
              : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          }
        >
          {message.text}
        </p>
      ) : null}

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Only workspace owners and admins can publish or roll back.
        </p>
      ) : null}

      <div>
        <h3 className="text-sm font-semibold text-foreground">Revision history</h3>
        {revisions.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No revisions yet. Publishing takes an immutable snapshot you can roll back to.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {revisions.map((revision, index) => (
              <li
                key={revision.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="text-foreground">
                  v{revision.versionNumber}
                  {index === 0 ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                      latest
                    </span>
                  ) : null}
                  {revision.note ? (
                    <span className="ml-2 text-muted-foreground">{revision.note}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3 text-muted-foreground">
                  {formatDate(revision.createdAt)}
                  {index > 0 && canManage ? (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        call(
                          `/api/workspaces/${workspaceId}/sites/${siteId}/rollback`,
                          { revisionId: revision.id },
                          revision.id,
                        )
                      }
                      className="text-accent hover:underline disabled:opacity-50"
                    >
                      Restore
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
