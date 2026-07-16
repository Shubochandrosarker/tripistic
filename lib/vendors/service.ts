import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import type { VendorInvoiceListQuery, VendorListQuery } from "./types";

export async function requireVendor(workspaceId: string, vendorId: string) {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, workspaceId, deletedAt: null } });
  if (!vendor) throw notFound("Vendor not found");
  return vendor;
}

export function buildVendorListQuery(workspaceId: string, query: VendorListQuery) {
  const where: Prisma.VendorWhereInput = { workspaceId, deletedAt: null };
  if (query.kind) where.kind = query.kind;
  if (query.isActive !== undefined) where.isActive = query.isActive;
  if (query.search) {
    const search = query.search.trim();
    if (search.length > 0) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
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

export async function listVendors(workspaceId: string, query: VendorListQuery) {
  const { where, orderBy, skip, take } = buildVendorListQuery(workspaceId, query);
  const [vendors, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { _count: { select: { invoices: true } } },
    }),
    prisma.vendor.count({ where }),
  ]);
  return { vendors, total };
}

export type VendorInput = {
  name: string;
  kind?: "hotel" | "restaurant" | "transport" | "activity_provider" | "other";
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  commissionRateBps?: number;
  rating?: number;
  isActive?: boolean;
  notes?: string;
};

export async function createVendor(workspaceId: string, input: VendorInput) {
  return prisma.vendor.create({
    data: {
      workspaceId,
      name: input.name,
      kind: input.kind ?? "other",
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      country: input.country ?? null,
      commissionRateBps: input.commissionRateBps ?? null,
      rating: input.rating ?? null,
      isActive: input.isActive ?? true,
      notes: input.notes ?? null,
    },
  });
}

export async function updateVendor(workspaceId: string, vendorId: string, input: Partial<VendorInput>) {
  await requireVendor(workspaceId, vendorId);
  return prisma.vendor.update({
    where: { id: vendorId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.commissionRateBps !== undefined ? { commissionRateBps: input.commissionRateBps } : {}),
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

/** Soft delete only — a Vendor is never hard-deleted (VendorInvoice/ItineraryItem reference it). */
export async function archiveVendor(workspaceId: string, vendorId: string) {
  await requireVendor(workspaceId, vendorId);
  return prisma.vendor.update({ where: { id: vendorId }, data: { isActive: false, deletedAt: new Date() } });
}

/**
 * Sweeps unpaid invoices past their due date to `overdue` — called lazily
 * whenever invoices are listed (same "compute on read, no cron required"
 * approach as lib/payments/expiration.ts's pending-payment sweep, just
 * inline rather than an admin-triggered endpoint since overdue status has
 * no side effect beyond the label itself).
 */
async function sweepOverdueInvoices(workspaceId: string, vendorId?: string): Promise<void> {
  await prisma.vendorInvoice.updateMany({
    where: {
      workspaceId,
      ...(vendorId ? { vendorId } : {}),
      status: "unpaid",
      dueOn: { lt: new Date() },
    },
    data: { status: "overdue" },
  });
}

export function buildVendorInvoiceListQuery(workspaceId: string, vendorId: string, query: VendorInvoiceListQuery) {
  const where: Prisma.VendorInvoiceWhereInput = { workspaceId, vendorId };
  if (query.status) where.status = query.status;
  return {
    where,
    orderBy: { issuedOn: "desc" as const },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export async function listVendorInvoices(workspaceId: string, vendorId: string, query: VendorInvoiceListQuery) {
  await sweepOverdueInvoices(workspaceId, vendorId);
  const { where, orderBy, skip, take } = buildVendorInvoiceListQuery(workspaceId, vendorId, query);
  const [invoices, total] = await Promise.all([
    prisma.vendorInvoice.findMany({ where, orderBy, skip, take }),
    prisma.vendorInvoice.count({ where }),
  ]);
  return { invoices, total };
}

/** Unpaid + overdue invoices across every vendor — powers the Business Brain risk-alert and vendor list "unpaid" badge. */
export async function listUnpaidInvoicesAcrossWorkspace(workspaceId: string) {
  await sweepOverdueInvoices(workspaceId);
  return prisma.vendorInvoice.findMany({
    where: { workspaceId, status: { in: ["unpaid", "overdue"] } },
    orderBy: { dueOn: "asc" },
    include: { vendor: { select: { id: true, name: true } } },
  });
}

export type CreateVendorInvoiceInput = {
  invoiceNumber?: string;
  amountCents: number;
  currency?: string;
  issuedOn: Date;
  dueOn?: Date;
  notes?: string;
};

export async function createVendorInvoice(workspaceId: string, vendorId: string, input: CreateVendorInvoiceInput) {
  await requireVendor(workspaceId, vendorId);
  return prisma.vendorInvoice.create({
    data: {
      workspaceId,
      vendorId,
      invoiceNumber: input.invoiceNumber ?? null,
      amountCents: input.amountCents,
      currency: input.currency ?? "USD",
      issuedOn: input.issuedOn,
      dueOn: input.dueOn ?? null,
      notes: input.notes ?? null,
    },
  });
}

export type UpdateVendorInvoiceInput = {
  status?: "unpaid" | "paid" | "overdue" | "cancelled";
  dueOn?: Date | null;
  notes?: string;
};

export async function updateVendorInvoice(workspaceId: string, invoiceId: string, input: UpdateVendorInvoiceInput) {
  const existing = await prisma.vendorInvoice.findFirst({ where: { id: invoiceId, workspaceId } });
  if (!existing) throw notFound("Invoice not found");
  if (existing.status === "cancelled") throw badRequest("A cancelled invoice cannot be edited.");

  return prisma.vendorInvoice.update({
    where: { id: invoiceId },
    data: {
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined
        ? { status: input.status, paidAt: input.status === "paid" ? new Date() : null }
        : {}),
    },
  });
}
