import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import type { CompanyListQuery } from "./types";

export async function requireCompany(workspaceId: string, companyId: string) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, workspaceId, deletedAt: null },
  });
  if (!company) throw notFound("Company not found");
  return company;
}

/** Shared filter builder used by both `GET /api/workspaces/:id/companies` and the `/dashboard/companies` page. */
export function buildCompanyListQuery(workspaceId: string, query: CompanyListQuery) {
  const where: Prisma.CompanyWhereInput = { workspaceId, deletedAt: null };
  if (query.kind) where.kind = query.kind;

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
    orderBy: { name: "asc" as const },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export async function listCompanies(workspaceId: string, query: CompanyListQuery) {
  const { where, orderBy, skip, take } = buildCompanyListQuery(workspaceId, query);
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { _count: { select: { customers: true, leads: true } } },
    }),
    prisma.company.count({ where }),
  ]);
  return { companies, total };
}

export type CreateCompanyInput = {
  name: string;
  kind?: "travel_agent" | "hotel" | "partner" | "other";
  email?: string;
  phone?: string;
  website?: string;
  country?: string;
  commissionRateBps?: number;
  notes?: string;
};

export async function createCompany(workspaceId: string, input: CreateCompanyInput) {
  return prisma.company.create({
    data: {
      workspaceId,
      name: input.name,
      kind: input.kind ?? "other",
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      country: input.country ?? null,
      commissionRateBps: input.commissionRateBps ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateCompany(workspaceId: string, companyId: string, input: Partial<CreateCompanyInput>) {
  await requireCompany(workspaceId, companyId);
  return prisma.company.update({
    where: { id: companyId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.commissionRateBps !== undefined ? { commissionRateBps: input.commissionRateBps } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

/** Soft delete only — a Company is never hard-deleted (Customer/Lead composite FKs reference it with onDelete: Restrict). */
export async function archiveCompany(workspaceId: string, companyId: string) {
  await requireCompany(workspaceId, companyId);
  return prisma.company.update({ where: { id: companyId }, data: { deletedAt: new Date() } });
}
