import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * PostgreSQL-backed integration tests. Every test creates its own uniquely
 * namespaced workspace/tour/user fixtures (see tests/integration/helpers.ts),
 * so test files are safe to run concurrently against the one shared test
 * database — no truncation happens between tests. `globalSetup` truncates
 * once at the start of the run so a crashed previous run can't leak rows in.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    passWithNoTests: false,
  },
});
