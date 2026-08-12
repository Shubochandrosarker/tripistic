/**
 * Marketing analytics event layer.
 *
 * Every call is a no-op unless the visitor has consented to analytics and a
 * provider is configured, so calling `trackEvent` is always safe.
 */

export type ConsentCategory = "necessary" | "functional" | "analytics" | "marketing";

export type ConsentState = Record<ConsentCategory, boolean>;

export const CONSENT_COOKIE = "tripistic.consent";
export const CONSENT_EVENT = "tripistic:consent-change";

export const DEFAULT_CONSENT: ConsentState = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
};

export const FULL_CONSENT: ConsentState = {
  necessary: true,
  functional: true,
  analytics: true,
  marketing: true,
};

/** Conversion events worth tracking across every provider. */
export type MarketingEvent =
  | "cta_click"
  | "signup_start"
  | "demo_request"
  | "contact_submit"
  | "newsletter_subscribe"
  | "pricing_plan_select"
  | "pricing_interval_toggle"
  | "roi_calculated"
  | "docs_search"
  | "video_play"
  | "comparison_view"
  /**
   * Travel Advisor funnel.
   *
   * Recorded as ordinary marketing events, and named to describe what the
   * visitor did rather than what caused it. `tour_opened` after `ai_session` is
   * a correlation; calling it an AI-driven conversion would be a claim the data
   * cannot support, and the V3 brief is explicit that it must not be made.
   */
  | "ai_session"
  | "ai_mode_switch"
  | "tour_recommended"
  | "tour_opened"
  | "booking_started"
  | "signup_started";

type EventProperties = Record<string, string | number | boolean | undefined>;

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  lintrk?: (...args: unknown[]) => void;
  clarity?: (...args: unknown[]) => void;
};

function getWindow(): GtagWindow | null {
  return typeof window === "undefined" ? null : (window as GtagWindow);
}

export function readConsent(): ConsentState {
  const win = getWindow();
  if (!win) return DEFAULT_CONSENT;

  const match = win.document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE}=`));
  if (!match) return DEFAULT_CONSENT;

  try {
    const parsed = JSON.parse(decodeURIComponent(match.split("=").slice(1).join("=")));
    return { ...DEFAULT_CONSENT, ...parsed, necessary: true };
  } catch {
    return DEFAULT_CONSENT;
  }
}

export function writeConsent(state: ConsentState): void {
  const win = getWindow();
  if (!win) return;

  const value = encodeURIComponent(JSON.stringify(state));
  const secure = win.location.protocol === "https:" ? "; Secure" : "";
  // 12 months, matching the Cookie Policy.
  win.document.cookie = `${CONSENT_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  win.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
}

export function hasStoredConsent(): boolean {
  const win = getWindow();
  if (!win) return false;
  return win.document.cookie.includes(`${CONSENT_COOKIE}=`);
}

/** Honour Global Privacy Control, as documented in the Cookie Policy. */
export function isGlobalPrivacyControlEnabled(): boolean {
  const win = getWindow();
  if (!win) return false;
  return (win.navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/**
 * Sends an event to every configured provider the visitor has consented to.
 * Safe to call from anywhere — server-side calls and unconsented visitors are
 * silently ignored.
 */
export function trackEvent(event: MarketingEvent, properties: EventProperties = {}): void {
  const win = getWindow();
  if (!win) return;

  const consent = readConsent();
  if (!consent.analytics && !consent.marketing) return;

  const payload = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );

  if (consent.analytics) {
    win.gtag?.("event", event, payload);
    win.clarity?.("event", event);
    win.dataLayer?.push({ event, ...payload });
  }

  if (consent.marketing) {
    win.fbq?.("trackCustom", event, payload);
    win.lintrk?.("track", { conversion_type: event });
  }
}

/** Marks a high-intent conversion in addition to the standard event. */
export function trackConversion(event: MarketingEvent, value?: number): void {
  const win = getWindow();
  if (!win) return;

  trackEvent(event, { value });

  const consent = readConsent();
  if (consent.marketing) {
    win.fbq?.("track", "Lead", value ? { value, currency: "USD" } : undefined);
  }
}
