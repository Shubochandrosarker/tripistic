import { test, expect, type Page } from "@playwright/test";

import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_SITE_HERO_HEADLINE,
  E2E_SITE_NAME,
} from "../../prisma/e2e-fixture-constants";
import { acceptNecessaryCookiesOnly } from "./consent";

/**
 * The Site Builder, in a real browser.
 *
 * The integration suite already proves the API routes and the renderer. What
 * only a browser can prove is that the editor's three panes actually wire up:
 * that selecting a section fills the properties panel, that typing there
 * changes the preview, and that the preview is the *server's* renderer rather
 * than a client-side approximation of it.
 *
 * **One login for the whole file, deliberately.** `RATE_LIMITS.login` allows
 * ten attempts per IP per fifteen minutes, and the whole Playwright run comes
 * from one address. A `beforeEach` login in every spec would spend that budget
 * and the later tests would fail at the sign-in form — which reads as a broken
 * feature and is really the rate limiter working correctly. Sharing an
 * authenticated page costs one login and removes the coupling entirely.
 *
 * Publishing is deliberately not exercised. It needs a Cloudflare dispatch
 * namespace, CI has none, and a test that asserted a successful publish here
 * would be asserting against a mock — which proves less than not testing it,
 * because it reads as coverage.
 */

test.describe.configure({ mode: "serial" });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await acceptNecessaryCookiesOnly(page);
  await page.goto("/login");
  await page.locator("#email").fill(E2E_OWNER_EMAIL);
  await page.locator("#password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test.afterAll(async () => {
  await page.close();
});

/**
 * Opens one tab of the seeded site.
 *
 * Navigates by URL rather than by clicking through. The existing dashboard spec
 * documents the reason: roughly one run in ten a click lands before the App
 * Router has hydrated, React claims the event, and no navigation follows — the
 * subsequent assertion then polls for its full timeout against an unchanged
 * page. Resolving the href once and calling `goto` removes the race, and the
 * link itself is still asserted in the first test.
 */
async function openTab(tab: "Overview" | "Editor" | "Pages" | "Brand") {
  await page.goto("/dashboard/sites");
  const href = await page.getByRole("link", { name: E2E_SITE_NAME }).getAttribute("href");
  expect(href, "site link href").toBeTruthy();

  const suffix = tab === "Overview" ? "" : `/${tab.toLowerCase()}`;
  await page.goto(`${href}${suffix}`);
  await expect(page.getByRole("heading", { name: E2E_SITE_NAME })).toBeVisible();
}

test("the site list shows the seeded website and links to it", async () => {
  await page.goto("/dashboard/sites");
  await expect(page.getByRole("heading", { name: "Site Builder" })).toBeVisible();
  await expect(page.getByRole("link", { name: E2E_SITE_NAME })).toBeVisible();
});

test("the overview reports the site's publishing state honestly", async () => {
  await openTab("Overview");
  await expect(page.getByRole("heading", { name: "Publishing" })).toBeVisible();
  // Never published, so the honest state is "no revisions to roll back to"
  // rather than a rollback button that would fail.
  await expect(page.getByText(/No revisions yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Roll back to v/ })).toHaveCount(0);
});

test("the editor renders the section list, preview and properties panel", async () => {
  await openTab("Editor");
  await expect(page.getByRole("heading", { name: "Sections" })).toBeVisible();

  // The seeded hero appears in the section list…
  const heroEntry = page.getByRole("button", { name: "Hero", exact: true });
  await expect(heroEntry).toBeVisible();

  // …the preview is the server-rendered page, framed…
  const preview = page.frameLocator('iframe[title^="Preview of"]');
  await expect(preview.locator("body")).toContainText(E2E_SITE_HERO_HEADLINE, { timeout: 20_000 });

  // …and selecting the section fills the properties panel with its real props.
  await heroEntry.click();
  await expect(page.getByLabel("Headline", { exact: true })).toHaveValue(E2E_SITE_HERO_HEADLINE);
});

test("editing a property updates the server-rendered preview and autosaves", async () => {
  await openTab("Editor");
  await page.getByRole("button", { name: "Hero", exact: true }).click();

  const headline = page.getByLabel("Headline", { exact: true });
  await expect(headline).toHaveValue(E2E_SITE_HERO_HEADLINE);

  const updated = "Sunrise on the north ridge";
  await headline.fill(updated);

  // Debounced and round-tripped to the server, so this waits rather than
  // asserting immediately. That the new text appears at all is the point: it
  // came back from `lib/sites/render.ts`.
  const preview = page.frameLocator('iframe[title^="Preview of"]');
  await expect(preview.locator("body")).toContainText(updated, { timeout: 20_000 });

  await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 20_000 });

  // Restored so the file can be re-run without the fixture drifting.
  await headline.fill(E2E_SITE_HERO_HEADLINE);
  await expect(preview.locator("body")).toContainText(E2E_SITE_HERO_HEADLINE, { timeout: 20_000 });
});

test("adding a section from the library inserts it and selects it", async () => {
  await openTab("Editor");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: /^FAQ/ }).click();

  // Selected, so the properties panel is showing the new section.
  await expect(page.getByRole("heading", { name: "FAQ" })).toBeVisible();
  await expect(page.getByRole("button", { name: "FAQ", exact: true })).toBeVisible();

  // Removed again, for the same reason the headline is restored above.
  await page.getByRole("button", { name: "Delete section" }).last().click();
});

test("the brand panel refuses a palette that fails contrast", async () => {
  await openTab("Brand");
  await expect(page.getByRole("heading", { name: "Brand kit" })).toBeVisible();
  await expect(page.getByText(/meets WCAG AA/)).toBeVisible();

  // Near-white text on a white background. The schema would reject this on
  // save; the point of the readout is that the operator sees why before then.
  await page.getByLabel("Body text hex value").fill("#f5f5f5");
  await expect(page.getByText(/below the 4.5:1 minimum/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save brand" })).toBeDisabled();
});

test("the pages tab lists the template page and protects the homepage", async () => {
  await openTab("Pages");
  await expect(page.getByRole("heading", { name: "Pages" })).toBeVisible();
  // Template-owned, so deletion is refused in the UI as well as by the API.
  await expect(page.getByRole("button", { name: /Delete Home/ })).toBeDisabled();
});
