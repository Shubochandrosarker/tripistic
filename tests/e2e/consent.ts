import type { Page } from "@playwright/test";
import { CONSENT_COOKIE, DEFAULT_CONSENT } from "../../lib/analytics/events";

/**
 * Records a consent decision before the page loads, so the cookie banner
 * never renders.
 *
 * `CookieConsent` is mounted in the root layout (`app/layout.tsx`) and is
 * `fixed inset-x-0 bottom-0 z-50`, so on a first visit it covers the bottom
 * of the viewport on *every* route — including the guest booking and
 * confirmation pages. That puts it directly over the waiver signature pad,
 * where it swallows the pointer events the signing test dispatches and the
 * canvas records no stroke.
 *
 * Seeding the decision keeps these tests focused on the flow under test.
 * The overlap itself is a real UX problem for guests on short viewports and
 * is tracked separately — this helper does not fix it, it only stops it from
 * masking unrelated assertions.
 */
export async function acceptNecessaryCookiesOnly(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: CONSENT_COOKIE,
      value: encodeURIComponent(JSON.stringify(DEFAULT_CONSENT)),
      url: "http://localhost:3000",
    },
  ]);
}
