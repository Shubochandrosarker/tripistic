/**
 * Shared, side-effect-free constants for the Playwright fixture — imported
 * by both `seed-e2e.ts` (which creates the rows) and the Playwright spec
 * (which never wants `seed-e2e.ts`'s top-level `main()` call to re-run just
 * because it imported a constant).
 */
export const E2E_OWNER_EMAIL = "e2e-owner@tripistic.test";
export const E2E_OWNER_PASSWORD = "E2ePassword123!";
export const E2E_WORKSPACE_SLUG = "e2e-tours";
export const E2E_TOUR_SLUG = "desert-jeep-tour";
export const E2E_WAIVER_TOUR_SLUG = "canyon-rappel-tour";
export const E2E_CUSTOM_DOMAIN = "e2e-custom.tripistic.test";

/** Deliberately unlike "Tripistic", so a branded page is unambiguous in an assertion. */
export const E2E_BRAND_NAME = "Kestrel Expeditions";

/** Site Builder fixture. The subdomain is globally unique, so it is namespaced. */
export const E2E_SITE_NAME = "Kestrel Expeditions Website";
export const E2E_SITE_SUBDOMAIN = "e2e-kestrel";
/**
 * Copy that appears nowhere else in the application.
 *
 * The editor and preview assertions match on this string, so a passing test
 * cannot be one that found the same words in the dashboard chrome.
 */
export const E2E_SITE_HERO_HEADLINE = "Ridgeline crossings with Kestrel";
