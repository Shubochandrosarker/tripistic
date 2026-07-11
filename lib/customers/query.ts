import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { customerListQuerySchema } from "@/lib/validation";

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

/** Shared filter builder used by both `GET /api/workspaces/:id/customers` and the `/dashboard/customers` page. */
export function buildCustomerListQuery(
  workspaceId: string,
  query: CustomerListQuery,
): { where: Prisma.CustomerWhereInput; orderBy: Prisma.CustomerOrderByWithRelationInput; skip: number; take: number } {
  const where: Prisma.CustomerWhereInput = { workspaceId, deletedAt: null };

  if (query.consentStatus) where.consentStatus = query.consentStatus;

  if (query.search) {
    const search = query.search.trim();
    if (search.length > 0) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  return {
    where,
    orderBy: { createdAt: "desc" },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}
