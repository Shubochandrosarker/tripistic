import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Accepted by service functions that must run either standalone or inside a
 * caller-managed `prisma.$transaction(async (tx) => ...)` block — lets one
 * implementation serve both call shapes without duplicating logic.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
