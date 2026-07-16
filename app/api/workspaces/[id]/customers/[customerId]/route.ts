import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCustomers, canViewCustomers } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateCustomerSchema } from "@/lib/validation";
import { serializeCustomerDetail } from "@/lib/customers/serializers";
import { computeCustomerInsights } from "@/lib/crm/insights";

type Params = { params: Promise<{ id: string; customerId: string }> };

const DETAIL_INCLUDE = {
  bookings: {
    orderBy: { departureStartsAt: "desc" as const },
    take: 25,
    select: {
      id: true,
      reference: true,
      status: true,
      tourTitleSnapshot: true,
      departureStartsAt: true,
      totalAmount: true,
      currency: true,
    },
  },
  messages: { orderBy: { createdAt: "desc" as const }, take: 25 },
  company: { select: { id: true, name: true } },
};

async function requireCustomer(workspaceId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, workspaceId, deletedAt: null },
    include: DETAIL_INCLUDE,
  });
  if (!customer) throw notFound("Customer not found");
  return customer;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, customerId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewCustomers(membership.role)) {
      throw forbidden("You do not have permission to view customers.");
    }
    const customer = await requireCustomer(id, customerId);
    const insights = canManageCustomers(membership.role)
      ? await computeCustomerInsights(id, customerId)
      : null;
    return json({ customer: serializeCustomerDetail(customer, membership.role), insights });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Edits name/phone/country/tags/notes/consentStatus — never email, the dedup key. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, customerId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageCustomers(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit customers.");
    }
    await requireCustomer(id, customerId);

    const body = await request.json().catch(() => null);
    const data = updateCustomerSchema.parse(body);

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.tags !== undefined ? { tags: data.tags } : {}),
        ...(data.consentStatus !== undefined ? { consentStatus: data.consentStatus } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
      include: DETAIL_INCLUDE,
    });

    await recordAuditEvent({
      action: "customer_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "customer",
      entityId: customerId,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ customer: serializeCustomerDetail(updated, membership.role) });
  } catch (error) {
    return handleApiError(error);
  }
}
