import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewCustomers } from "@/lib/auth/permissions";
import { customerListQuerySchema } from "@/lib/validation";
import { buildCustomerListQuery } from "@/lib/customers/query";
import { serializeCustomerListItem } from "@/lib/customers/serializers";

type Params = { params: Promise<{ id: string }> };

/** Paginated, searchable customer list. Owner/admin/staff full PII; viewer redacted (matches booking list PII gating). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewCustomers(membership.role)) {
      throw forbidden("You do not have permission to view customers.");
    }

    const url = new URL(request.url);
    const query = customerListQuerySchema.parse(Object.fromEntries(url.searchParams));
    const { where, orderBy, skip, take } = buildCustomerListQuery(id, query);

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy, skip, take, include: { _count: { select: { bookings: true } } } }),
      prisma.customer.count({ where }),
    ]);

    return json({
      customers: customers.map((c) => serializeCustomerListItem(c, membership.role)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
