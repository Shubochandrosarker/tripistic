import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.test" });

if (!process.env.DATABASE_URL?.includes("tripistic_test")) {
  throw new Error(
    "Refusing to run integration tests: DATABASE_URL does not point at the tripistic_test " +
      "database. Check .env.test — integration tests truncate every app table on startup.",
  );
}

/**
 * Runs once before the whole integration suite — leaves every test to build
 * its own isolated fixtures. Truncates whichever application tables the
 * current schema actually has (discovered via `information_schema`, not a
 * hardcoded list), so this stays correct as the schema grows across phases
 * instead of needing an edit every time a migration adds a table.
 */
export async function setup() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public' AND tablename != '_prisma_migrations';`,
    );
    if (rows.length === 0) return;
    const tableList = rows.map((row) => `"${row.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} CASCADE;`);
  } finally {
    await prisma.$disconnect();
  }
}
