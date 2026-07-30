import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Critical public-booking flow only (master prompt §29) — run against a
 * production build + the deterministic fixture from `prisma/seed-e2e.ts`.
 * Invoked via `npm run test:e2e` (scripts/test-e2e.sh), which migrates,
 * seeds, and builds before this config starts the server.
 */

// Some sandboxed dev environments pre-install Chromium at a fixed path and
// skip Playwright's own browser download; use it when present. CI runs
// `npx playwright install --with-deps chromium` instead, so this path won't
// exist there and Playwright's normal managed-browser resolution applies.
const PINNED_CHROMIUM_PATH = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PINNED_CHROMIUM_PATH) ? PINNED_CHROMIUM_PATH : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  // This single test walks a full user journey across ~10 page
  // transitions (public booking, login, dashboard, cancellation) against a
  // real production server + Postgres. Under a resource-constrained sandbox
  // running the server, database, and Chromium concurrently, cumulative
  // step latency can legitimately exceed a tight budget even though no
  // individual step is actually stuck — give the whole test realistic
  // headroom rather than tuning each step's timeout individually.
  timeout: 120_000,
  // Same "resource-constrained sandbox" headroom reasoning as the overall
  // test timeout above, applied to individual assertions: the default
  // 5s `expect(...).toBeVisible()`/`toHaveURL()` budget is tight enough
  // that cumulative contention from the server + Postgres + Chromium
  // running concurrently can trip it even when the app itself responded
  // correctly (observed: a waiver-publish assertion failed while the
  // page's own DOM snapshot showed the new version had, in fact, already
  // published under the new title).
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    // `npm run test:e2e` rebuilds before it gets here, so reusing whatever is
    // already on :3000 would run the whole suite against the *previous* build
    // and report the result as if it meant something. That has produced both
    // false greens and false reds — the failure mode is silent either way,
    // because a stale server answers exactly like a fresh one.
    //
    // So the script sets E2E_FRESH_BUILD and reuse is refused: if a server is
    // already holding the port, `next start` fails loudly with EADDRINUSE,
    // which is a far better outcome than a passing run that proves nothing.
    // Bare `npx playwright test` (iterating against a dev server you started
    // yourself) still reuses it.
    reuseExistingServer: !process.env.CI && !process.env.E2E_FRESH_BUILD,
    timeout: 60_000,
  },
});
