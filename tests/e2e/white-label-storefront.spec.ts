import { test, expect } from "@playwright/test";

import { E2E_BRAND_NAME, E2E_TOUR_SLUG, E2E_WORKSPACE_SLUG } from "../../prisma/e2e-fixture-constants";
import { acceptNecessaryCookiesOnly } from "./consent";

/**
 * Phase 9 — the white-label promise, proved end to end.
 *
 * Before this, an operator's storefront rendered a Tripistic logo in the
 * header, the word "Tripistic" beside it, and "Powered by Tripistic" in the
 * footer — on their own custom domain, wrapped around their own content. The
 * brand they had configured was applied only inside the storefront body.
 *
 * These assertions are deliberately about the *chrome*, not the body: the body
 * was never the broken part.
 */

const OWNS_THE_PAGE = new RegExp(E2E_BRAND_NAME, "i");

test("the operator's storefront is branded as theirs, not as Tripistic's", async ({ page }) => {
  await acceptNecessaryCookiesOnly(page);
  await page.goto(`/book/${E2E_WORKSPACE_SLUG}`);

  // Targeted by landmark role rather than by tag: section cards render their
  // own <header>, so a bare `locator("header")` is a strict-mode violation on
  // any page with more than one card.
  //
  // The banner is the first thing a guest sees and was the most visible
  // failure: it said "Tripistic" above the operator's own storefront.
  await expect(page.getByRole("banner")).toContainText(OWNS_THE_PAGE);
  await expect(page.getByRole("banner")).not.toContainText(/Tripistic/i);
});

test("the vendor is not named in the footer of a white-labelled storefront", async ({ page }) => {
  await acceptNecessaryCookiesOnly(page);
  await page.goto(`/book/${E2E_WORKSPACE_SLUG}`);

  // The seeded workspace is on the enterprise plan, which includes
  // `white_label`. The attribution is resolved from that entitlement
  // server-side, not from a storefront setting.
  await expect(page.getByRole("contentinfo")).not.toContainText(/Powered by Tripistic/i);
  await expect(page.getByRole("contentinfo")).toContainText(OWNS_THE_PAGE);
});

test("branding carries through the booking journey, not just the landing page", async ({ page }) => {
  await acceptNecessaryCookiesOnly(page);

  // A guest who sees the operator's brand on the storefront and the vendor's
  // at the point of paying has not been shown a white-labelled product. The
  // tour page is one step deeper and rendered the vendor's chrome before.
  await page.goto(`/book/${E2E_WORKSPACE_SLUG}/${E2E_TOUR_SLUG}`);

  await expect(page.getByRole("banner")).toContainText(OWNS_THE_PAGE);
  await expect(page.getByRole("banner")).not.toContainText(/Tripistic/i);
  await expect(page.getByRole("contentinfo")).not.toContainText(/Powered by Tripistic/i);
});

test("the marketing site still shows Tripistic's own identity", async ({ page }) => {
  await acceptNecessaryCookiesOnly(page);
  await page.goto("/");

  // The guard against over-correcting: an operator's brand must never leak
  // onto a page that is not theirs, and our own site is still ours.
  await expect(page.getByRole("banner")).toContainText(/Tripistic/i);
  // `body` rather than the main landmark: the marketing shell does not expose
  // one, and a locator that matches nothing would make this assertion vacuous.
  await expect(page.locator("body")).not.toContainText(OWNS_THE_PAGE);
});
