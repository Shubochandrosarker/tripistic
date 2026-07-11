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
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
