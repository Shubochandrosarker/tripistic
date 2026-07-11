import { test, expect } from "@playwright/test";
import { E2E_WAIVER_TOUR_SLUG, E2E_WORKSPACE_SLUG } from "../../prisma/e2e-fixture-constants";

/**
 * The one piece of Phase 6 that unit/integration tests fundamentally can't
 * validate: the canvas-based signature pad actually captures a drawn
 * stroke and the resulting PNG data URL round-trips through the public
 * signing API. Runs against the deterministic waiver-required tour seeded
 * by `prisma/seed-e2e.ts` and a production build.
 */
test("guest books a waiver-required tour and signs the waiver from the confirmation page", async ({ page }) => {
  await page.goto(`/book/${E2E_WORKSPACE_SLUG}/${E2E_WAIVER_TOUR_SLUG}`);
  await expect(page.getByRole("heading", { name: "Canyon Rappel Tour" })).toBeVisible();

  const departureOptions = page.getByTestId("departure-option");
  await expect(departureOptions.first()).toBeVisible();
  await departureOptions.first().click();

  await page.locator("#party-size").fill("1");
  await page.locator('input[name="participant-0-firstName"]').fill("Ada");
  await page.locator('input[name="participant-0-lastName"]').fill("Lovelace");
  await page.locator("#guest-email").fill(`e2e-waiver-${Date.now()}@example.com`);
  await page.locator('input[name="termsAccepted"]').check();
  await page.getByTestId("submit-booking").click();

  await expect(page).toHaveURL(/\/book\/confirmation\//);

  // The waiver section loads asynchronously (client-side fetch) — wait for
  // the participant row and its "Sign waiver" action to actually appear.
  const signButton = page.getByRole("button", { name: "Sign waiver" });
  await expect(signButton).toBeVisible();
  await signButton.click();

  const nameInput = page.getByLabel("Signed by (full legal name)");
  await expect(nameInput).toHaveValue("Ada Lovelace");

  const canvas = page.getByTestId("signature-canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("signature canvas has no bounding box");
  // Draw a short, clearly non-empty stroke across the pad.
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Submit signature" }).click();

  // The participant now shows as signed instead of offering to sign again.
  await expect(page.getByText("Signed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign waiver" })).toHaveCount(0);

  // Reloading proves the signature actually persisted server-side, not just client state.
  await page.reload();
  await expect(page.getByText("Signed", { exact: true })).toBeVisible();
});
