import { test, expect } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_TOUR_SLUG } from "../../prisma/e2e-fixture-constants";
import { acceptNecessaryCookiesOnly } from "./consent";

/**
 * Smoke-checks the operator-facing dashboard surfaces this phase adds —
 * Guides roster, My Manifest, the availability guide-select, and the
 * settings Waiver panel — actually render in a real browser, not just
 * that their underlying API routes work (already proven by the
 * integration suite).
 */
test.beforeEach(async ({ page }) => {
  // Mounted in the root layout, so it overlays the bottom of dashboard pages
  // too and can intercept clicks on rows near the fold.
  await acceptNecessaryCookiesOnly(page);
  await page.goto("/login");
  await page.locator("#email").fill(E2E_OWNER_EMAIL);
  await page.locator("#password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("Guides page renders the roster and an editable profile", async ({ page }) => {
  await page.goto("/dashboard/guides");
  await expect(page.getByRole("heading", { name: "Guides" })).toBeVisible();
  await expect(page.getByText(E2E_OWNER_EMAIL)).toBeVisible();
});

test("My Manifest page renders (empty state for an owner with no assignments)", async ({ page }) => {
  await page.goto("/dashboard/manifest");
  await expect(page.getByRole("heading", { name: "My Manifest" })).toBeVisible();
  await expect(page.getByText("No assigned departures")).toBeVisible();
});

test("the tour detail page's departure table includes a guide-assignment select", async ({ page }) => {
  await page.goto("/dashboard/tours");

  const tourLink = page.getByRole("link", { name: /Desert Jeep Tour/ });
  await expect(tourLink).toBeVisible();

  // Retried rather than clicked once. Roughly one run in ten, the click lands
  // and no navigation follows: the URL assertion then polls for its full
  // timeout against an unchanged address. The mechanism is not proven — the
  // symptom is consistent with the click arriving before the App Router has
  // hydrated, so React claims it and the router that would complete it is not
  // listening yet — but the symptom is reproducible and this covers it.
  //
  // Nothing is weakened: this still requires a real click to produce a real
  // navigation, and it fails if none ever does.
  await expect(async () => {
    await tourLink.click();
    await page.waitForURL(/\/dashboard\/tours\/[^/]+$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByRole("columnheader", { name: "Guide" })).toBeVisible();
  const guideSelect = page.getByLabel("Assigned guide").first();
  await expect(guideSelect).toBeVisible();
  await expect(guideSelect.getByRole("option", { name: "E2E Owner" })).toHaveCount(1);
  void E2E_TOUR_SLUG;
});

test("Settings page's Waiver panel shows the published waiver and can publish a new version", async ({ page }) => {
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Waiver" })).toBeVisible();
  await expect(page.getByText("Liability Waiver", { exact: false }).first()).toBeVisible();

  // Read the current version number rather than hardcoding one — this spec
  // may run more than once against the same seeded workspace, and each
  // publish is a real, monotonically-incrementing new version.
  const versionText = await page.getByText(/current — v\d+/).innerText();
  const currentVersion = Number(versionText.match(/v(\d+)/)?.[1]);
  expect(Number.isFinite(currentVersion)).toBe(true);

  const uniqueTitle = `Liability Waiver — Updated ${Date.now()}`;
  await page.getByRole("button", { name: "Publish a new version" }).click();
  await page.getByLabel("Title").fill(uniqueTitle);
  await page.getByLabel("Waiver text").fill("Updated waiver text with additional disclosures for this e2e smoke check.");

  // `onPublish` in components/settings/waiver-panel.tsx PUTs, then calls
  // router.refresh() without awaiting it — the panel keeps rendering the
  // stale `currentVersion` prop until that RSC refetch lands. Asserting the
  // new version straight after the click therefore races a server round-trip
  // that re-renders the whole settings page, and on a loaded CI runner it can
  // lose: this test failed twice on main at 1fb087b waiting for
  // `current — v2`, while the retry read v2, proving the publish itself had
  // succeeded and only the UI had not caught up.
  //
  // Wait for the write to be acknowledged, then reload so the assertions run
  // against server-rendered state instead of the refresh timing.
  const published = page.waitForResponse(
    (response) =>
      response.url().includes("/waiver-template") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await published;

  await page.reload();
  await expect(page.getByText(`current — v${currentVersion + 1}`, { exact: false })).toBeVisible();
  await expect(page.getByText(uniqueTitle, { exact: false }).first()).toBeVisible();
});
