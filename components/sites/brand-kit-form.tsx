"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { contrastRatio, type SiteTheme } from "@/lib/sites/schema";

/**
 * The brand kit.
 *
 * The contrast readout is the part worth explaining. `validateSiteTheme`
 * refuses a theme whose body text fails WCAG AA against its background, and
 * that refusal happens on save — so without a live indicator the operator
 * discovers it as a rejected form with no obvious cause. Showing the ratio as
 * the colours change turns a validation error into a design decision made with
 * the information in front of you.
 *
 * The check is duplicated here, but not in a way that can drift into being the
 * only one: the schema still rejects on save, and this is an advisory readout
 * of the same computation.
 */

const COLOR_FIELDS = [
  { key: "primaryColor", label: "Primary" },
  { key: "secondaryColor", label: "Secondary" },
  { key: "accentColor", label: "Accent" },
  { key: "backgroundColor", label: "Background" },
  { key: "textColor", label: "Body text" },
] as const;

const HEADING_FONTS = ["system", "serif", "grotesk", "editorial"] as const;
const BODY_FONTS = ["system", "serif", "grotesk"] as const;
const BUTTON_RADII = ["none", "sm", "md", "lg", "pill"] as const;
const CARD_RADII = ["none", "sm", "md", "lg"] as const;

const inputClass =
  "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export function BrandKitForm({
  workspaceId,
  siteId,
  theme: initialTheme,
  canManage,
}: {
  workspaceId: string;
  siteId: string;
  theme: SiteTheme;
  canManage: boolean;
}) {
  const router = useRouter();
  const [theme, setTheme] = useState<SiteTheme>(initialTheme);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const contrast = useMemo(
    () => contrastRatio(theme.textColor, theme.backgroundColor),
    [theme.textColor, theme.backgroundColor],
  );
  const contrastOk = contrast >= 4.5;

  function set<K extends keyof SiteTheme>(key: K, value: SiteTheme[K]) {
    setTheme((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/sites/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage({ tone: "error", text: payload?.error ?? "Could not save the brand kit." });
        return;
      }
      setMessage({ tone: "ok", text: "Brand saved. Publish to put it live." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-foreground">
          Logo URL
          <input
            className={inputClass}
            value={theme.logoLightUrl}
            onChange={(event) => set("logoLightUrl", event.target.value)}
            placeholder="https://…"
          />
        </label>
        <label className="block text-sm font-medium text-foreground">
          Favicon URL
          <input
            className={inputClass}
            value={theme.faviconUrl}
            onChange={(event) => set("faviconUrl", event.target.value)}
            placeholder="https://…"
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Colours</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {COLOR_FIELDS.map((field) => (
            <label key={field.key} className="block text-xs font-medium text-muted-foreground">
              {field.label}
              <span className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${field.label} colour`}
                  value={theme[field.key]}
                  onChange={(event) => set(field.key, event.target.value)}
                  className="h-8 w-10 cursor-pointer rounded border border-border bg-background"
                />
                <input
                  aria-label={`${field.label} hex value`}
                  value={theme[field.key]}
                  onChange={(event) => set(field.key, event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs uppercase outline-none focus:border-accent"
                />
              </span>
            </label>
          ))}
        </div>

        <p
          className={
            contrastOk
              ? "mt-3 text-xs text-emerald-700 dark:text-emerald-300"
              : "mt-3 text-xs text-red-600 dark:text-red-400"
          }
        >
          Body text contrast: {contrast.toFixed(2)}:1{" "}
          {contrastOk
            ? "— meets WCAG AA."
            : "— below the 4.5:1 minimum. Saving will be refused until text and background have enough contrast."}
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm font-medium text-foreground">
          Heading font
          <select
            className={inputClass}
            value={theme.headingFont}
            onChange={(event) => set("headingFont", event.target.value as SiteTheme["headingFont"])}
          >
            {HEADING_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-foreground">
          Body font
          <select
            className={inputClass}
            value={theme.bodyFont}
            onChange={(event) => set("bodyFont", event.target.value as SiteTheme["bodyFont"])}
          >
            {BODY_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-foreground">
          Button corners
          <select
            className={inputClass}
            value={theme.buttonRadius}
            onChange={(event) => set("buttonRadius", event.target.value as SiteTheme["buttonRadius"])}
          >
            {BUTTON_RADII.map((radius) => (
              <option key={radius} value={radius}>
                {radius}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-foreground">
          Card corners
          <select
            className={inputClass}
            value={theme.cardRadius}
            onChange={(event) => set("cardRadius", event.target.value as SiteTheme["cardRadius"])}
          >
            {CARD_RADII.map((radius) => (
              <option key={radius} value={radius}>
                {radius}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? (
        <p className={message.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-600"}>
          {message.text}
        </p>
      ) : null}

      <Button onClick={save} disabled={!canManage || busy || !contrastOk}>
        {busy ? "Saving…" : "Save brand"}
      </Button>
      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          Only workspace owners and admins can change the brand.
        </p>
      ) : null}
    </div>
  );
}
