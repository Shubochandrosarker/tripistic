"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

/**
 * Rename and navigation, plus deletion.
 *
 * Deletion is soft on the server — the revision history and deployment record
 * survive as forensic data — but the wording here does not lean on that. To the
 * operator the site is gone and the address is released, so the confirmation
 * asks them to type the name rather than clicking through a dialog they will
 * not read.
 */
export function SiteSettingsForm({
  workspaceId,
  siteId,
  name: initialName,
  navigation: initialNavigation,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  name: string;
  navigation: { primary: Array<{ label: string; href: string }> };
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [navigation, setNavigation] = useState(initialNavigation.primary);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, navigation: { primary: navigation, footer: [] } }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ tone: "error", text: payload?.error ?? "Could not save." });
        return;
      }
      setMessage({ tone: "ok", text: "Saved." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/sites/${siteId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ tone: "error", text: payload?.error ?? "Could not delete the website." });
        return;
      }
      router.push("/dashboard/sites");
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

  return (
    <div className="space-y-6">
      <label className="block max-w-md text-sm font-medium text-foreground">
        Website name
        <input
          className={inputClass}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Primary navigation</legend>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Shown in the header of every page. Up to ten links.
        </p>
        <ul className="mt-2 space-y-2">
          {navigation.map((item, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Link ${index + 1} label`}
                className="w-40 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                value={item.label}
                maxLength={40}
                onChange={(event) =>
                  setNavigation(
                    navigation.map((entry, position) =>
                      position === index ? { ...entry, label: event.target.value } : entry,
                    ),
                  )
                }
              />
              <input
                aria-label={`Link ${index + 1} target`}
                className="w-56 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
                value={item.href}
                onChange={(event) =>
                  setNavigation(
                    navigation.map((entry, position) =>
                      position === index ? { ...entry, href: event.target.value } : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-red-600"
                onClick={() => setNavigation(navigation.filter((_, position) => position !== index))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          className="mt-2"
          disabled={navigation.length >= 10}
          onClick={() => setNavigation([...navigation, { label: "", href: "/" }])}
        >
          Add link
        </Button>
      </fieldset>

      {message ? (
        <p className={message.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}

      <Button onClick={save} disabled={!canManage || busy !== null}>
        {busy === "save" ? "Saving…" : "Save settings"}
      </Button>

      {canManage ? (
        <div className="rounded-lg border border-red-200 p-4 dark:border-red-900">
          <h3 className="text-sm font-semibold text-foreground">Delete this website</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The published site is taken off the edge immediately and the address is released. Type{" "}
            <strong className="text-foreground">{initialName}</strong> to confirm.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              aria-label="Type the website name to confirm deletion"
              className="w-64 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
            />
            <Button
              variant="danger"
              disabled={confirmText !== initialName || busy !== null}
              onClick={remove}
            >
              {busy === "delete" ? "Deleting…" : "Delete website"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
