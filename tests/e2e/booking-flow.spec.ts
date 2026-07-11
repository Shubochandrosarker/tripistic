import { test, expect } from "@playwright/test";
import {
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_TOUR_SLUG,
  E2E_WORKSPACE_SLUG,
} from "../../prisma/e2e-fixture-constants";

/**
 * The critical public-booking flow (master prompt §29): open the public
 * workspace page, pick a tour and departure, book as a guest, land on the
 * confirmation page, see the booking in the authenticated dashboard, cancel
 * it, and confirm the seats are released. Runs against the deterministic
 * fixture from `prisma/seed-e2e.ts` and a production build.
 */
test("guest books a public tour, operator sees and cancels it, seats are restored", async ({ page }) => {
  // 1-2. Open the public workspace page and select the seeded tour.
  await page.goto(`/book/${E2E_WORKSPACE_SLUG}`);
  await expect(page.getByRole("heading", { name: "E2E Tours" })).toBeVisible();
  await page.getByRole("link", { name: /Desert Jeep Tour/ }).click();
  await expect(page).toHaveURL(new RegExp(`/book/${E2E_WORKSPACE_SLUG}/${E2E_TOUR_SLUG}$`));

  const departureOptions = page.getByTestId("departure-option");
  await expect(departureOptions.first()).toBeVisible();
  const seatsTextBefore = await departureOptions.first().innerText();
  const seatsBefore = Number(seatsTextBefore.match(/(\d+) seats? left/)?.[1]);
  expect(Number.isFinite(seatsBefore)).toBe(true);
  await departureOptions.first().click();

  // 3. Party size of 2, plus one add-on.
  await page.locator("#party-size").fill("2");
  const addonQuantity = page.getByTestId("addon-quantity").first();
  if (await addonQuantity.count()) {
    await addonQuantity.fill("1");
  }

  // 4. Lead guest + second participant, contact details.
  await page.locator('input[name="participant-0-firstName"]').fill("Ada");
  await page.locator('input[name="participant-0-lastName"]').fill("Lovelace");
  await page.locator('input[name="participant-1-firstName"]').fill("Grace");
  await page.locator('input[name="participant-1-lastName"]').fill("Hopper");
  await page.locator("#guest-email").fill(`e2e-guest-${Date.now()}@example.com`);
  await page.locator('input[name="termsAccepted"]').check();

  // 5. Submit.
  await page.getByTestId("submit-booking").click();

  // 6. Confirmation page.
  await expect(page).toHaveURL(/\/book\/confirmation\//);
  await expect(page.getByRole("heading", { name: /Booking (confirmed|received)/ })).toBeVisible();
  const reference = (await page.getByTestId("booking-reference").innerText()).trim();
  expect(reference).toMatch(/^[A-Z0-9]{8}$/);

  // 7. Log in as the operator and find the booking in the dashboard.
  await page.goto("/login");
  await page.locator("#email").fill(E2E_OWNER_EMAIL);
  await page.locator("#password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto(`/dashboard/bookings?search=${reference}`);
  const bookingLink = page.getByRole("link", { name: reference });
  await expect(bookingLink).toBeVisible();
  const bookingHref = await bookingLink.getAttribute("href");
  expect(bookingHref).toMatch(/^\/dashboard\/bookings\//);
  await page.goto(bookingHref!);
  await expect(page).toHaveURL(new RegExp(bookingHref!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(page.getByText(reference)).toBeVisible();

  // 8. Cancel from the dashboard. The confirm action reloads the page once
  // the status change is saved (see components/bookings/booking-status-
  // actions.tsx), so wait directly for the reloaded page's updated status
  // rather than an intermediate dialog-closed state.
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText(/^cancelled$/i).first()).toBeVisible();

  // 9. Seats are restored on the public page.
  await page.goto(`/book/${E2E_WORKSPACE_SLUG}/${E2E_TOUR_SLUG}`);
  const seatsTextAfter = await page.getByTestId("departure-option").first().innerText();
  const seatsAfter = Number(seatsTextAfter.match(/(\d+) seats? left/)?.[1]);
  expect(seatsAfter).toBe(seatsBefore);
});
