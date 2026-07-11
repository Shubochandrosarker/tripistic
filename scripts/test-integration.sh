#!/usr/bin/env bash
# Runs the PostgreSQL-backed integration suite against tripistic_test.
# Migrates that database to the current schema, then runs Vitest.
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

echo "==> Running integration tests"
npx vitest run --config vitest.integration.config.ts
