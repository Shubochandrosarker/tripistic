#!/usr/bin/env bash
# Runs the critical public-booking Playwright flow against a production build
# and a freshly migrated + seeded tripistic_test database.
set -euo pipefail
cd "$(dirname "$0")/.."

# .env.test is gitignored (repo convention: no .env* file is committed except
# .env.example) — present for local/sandbox runs, absent in CI, where the
# workflow sets the equivalent variables directly.
if [ -f .env.test ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.test
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (expected from .env.test or the CI environment)" >&2
  exit 1
fi

echo "==> Migrating tripistic_test to the current schema"
npx prisma migrate deploy

echo "==> Seeding deterministic e2e fixture"
npx tsx prisma/seed-e2e.ts

echo "==> Building production bundle"
npm run build

echo "==> Running Playwright"
npx playwright test
