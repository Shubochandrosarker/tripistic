"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CONSENT_EVENT,
  DEFAULT_CONSENT,
  FULL_CONSENT,
  hasStoredConsent,
  isGlobalPrivacyControlEnabled,
  readConsent,
  writeConsent,
  type ConsentCategory,
  type ConsentState,
} from "@/lib/analytics/events";

const CATEGORIES: {
  key: ConsentCategory;
  label: string;
  description: string;
  locked?: boolean;
}[] = [
  {
    key: "necessary",
    label: "Strictly necessary",
    description: "Authentication, session integrity, workspace context, and your theme choice.",
    locked: true,
  },
  {
    key: "functional",
    label: "Functional",
    description: "Remembers preferences such as saved views and dismissed hints.",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Helps us understand which pages and features are used, and where things break.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Measures advertising performance. Never loaded without your consent.",
  },
];

/**
 * Consent banner. Rejecting is exactly as easy as accepting, and Global Privacy
 * Control is honoured automatically without showing the banner at all.
 */
export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(DEFAULT_CONSENT);

  useEffect(() => {
    if (hasStoredConsent()) return;

    // GPC is a legally recognised opt-out signal — record it and stay silent.
    if (isGlobalPrivacyControlEnabled()) {
      writeConsent(DEFAULT_CONSENT);
      return;
    }

    setDraft(readConsent());
    setOpen(true);
  }, []);

  useEffect(() => {
    const openPreferences = () => {
      setDraft(readConsent());
      setShowDetail(true);
      setOpen(true);
    };

    window.addEventListener("tripistic:open-cookie-preferences", openPreferences);
    return () => window.removeEventListener("tripistic:open-cookie-preferences", openPreferences);
  }, []);

  function save(state: ConsentState) {
    writeConsent(state);
    setOpen(false);
    setShowDetail(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:p-5"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <h2
              id="cookie-consent-title"
              className="flex items-center gap-2 text-sm font-semibold text-foreground"
            >
              <Cookie className="size-4 text-accent" aria-hidden />
              Cookie preferences
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              We use strictly necessary cookies to run the service. Analytics and marketing cookies
              load only if you allow them. Read the{" "}
              <Link href="/legal/cookie-policy" className="font-medium text-accent hover:underline">
                Cookie Policy
              </Link>{" "}
              or{" "}
              <Link href="/legal/privacy-policy" className="font-medium text-accent hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowDetail((value) => !value)}>
              {showDetail ? "Hide options" : "Manage options"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => save(DEFAULT_CONSENT)}>
              Reject non-essential
            </Button>
            <Button size="sm" onClick={() => save(FULL_CONSENT)}>
              Accept all
            </Button>
          </div>
        </div>

        {showDetail ? (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {CATEGORIES.map((category) => (
              <div key={category.key} className="flex items-start gap-3">
                <input
                  id={`consent-${category.key}`}
                  type="checkbox"
                  checked={category.locked ? true : draft[category.key]}
                  disabled={category.locked}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [category.key]: event.target.checked }))
                  }
                  className="mt-1 size-4 rounded border-border accent-[var(--accent)] disabled:opacity-60"
                />
                <label htmlFor={`consent-${category.key}`} className="flex-1">
                  <span className="block text-sm font-medium text-foreground">
                    {category.label}
                    {category.locked ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Always on
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {category.description}
                  </span>
                </label>
              </div>
            ))}

            <div className="flex justify-end pt-1">
              <Button size="sm" onClick={() => save({ ...draft, necessary: true })}>
                Save preferences
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Footer control that reopens the banner. Required by the Cookie Policy. */
export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("tripistic:open-cookie-preferences"))}
      className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Cookie preferences
    </button>
  );
}

export { CONSENT_EVENT };
