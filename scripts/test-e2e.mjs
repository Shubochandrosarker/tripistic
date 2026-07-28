import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

const envFile = join(root, ".env.test");
if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected from .env.test or the CI environment)");
  process.exit(1);
}

const commandName = (name) => (process.platform === "win32" ? `${name}.cmd` : name);

function run(label, command, args) {
  console.log(label);
  const result = spawnSync(commandName(command), args, { stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("==> Migrating tripistic_test to the current schema", "npx", ["prisma", "migrate", "deploy"]);
run("==> Seeding deterministic e2e fixture", "npx", ["tsx", "prisma/seed-e2e.ts"]);
run("==> Building production bundle", "npm", ["run", "build"]);
run("==> Running Playwright", "npx", ["playwright", "test"]);
