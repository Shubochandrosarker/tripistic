import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Pure-function unit tests — no database, no network. Anything that touches
 * Postgres belongs in `vitest.integration.config.ts` instead.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    passWithNoTests: false,
  },
});
