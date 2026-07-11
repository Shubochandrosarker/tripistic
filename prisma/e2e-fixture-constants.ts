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
