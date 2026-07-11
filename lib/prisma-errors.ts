import { Prisma } from "@prisma/client";

/** The column/constraint name(s) a P2002 unique-constraint violation fired on, or `[]` for any other error. */
export function uniqueViolationTargets(error: unknown): string[] {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = error.meta?.target;
    if (Array.isArray(target)) return target.map(String);
    if (typeof target === "string") return [target];
  }
  return [];
}
