import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewBookingPII } from "@/lib/auth/permissions";
import { crmTimelineQuerySchema } from "@/lib/validation";
import { prisma } from "@/lib/db";
import { notFound } from "@/lib/api";
import { buildCustomerTimeline } from "@/lib/crm/activities";

type Params = { params: Promise<{ id: string; customerId: string }> };

/** Merged bookings/payments/messages/activities feed — the Customer Timeline. Same PII tier as the customer detail route's notes/messages. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id, customerId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewBookingPII(membership.role)) {
      throw forbidden("You do not have permission to view this customer's timeline.");
    }

    const customer = await prisma.customer.findFirst({ where: { id: customerId, workspaceId: id, deletedAt: null } });
    if (!customer) throw notFound("Customer not found");

    const url = new URL(request.url);
    const query = crmTimelineQuerySchema.parse({
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const entries = await buildCustomerTimeline(id, customerId, query.pageSize);
    return json({ entries });
  } catch (error) {
    return handleApiError(error);
  }
}
