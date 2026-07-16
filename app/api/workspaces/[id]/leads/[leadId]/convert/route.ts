import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { convertLeadSchema } from "@/lib/validation";
import { convertLead } from "@/lib/crm/leads";

type Params = { params: Promise<{ id: string; leadId: string }> };

/** Converts a lead into a real Customer profile — see lib/crm/leads.ts `convertLead`. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, leadId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can convert leads.");
    }

    const body = await request.json().catch(() => ({}));
    const data = convertLeadSchema.parse(body ?? {});
    const result = await convertLead(id, leadId, user.id, data.bookingNote);

    await recordAuditEvent({
      action: "lead_converted",
      workspaceId: id,
      userId: user.id,
      entityType: "lead",
      entityId: leadId,
      metadata: { customerId: result.customerId, createdNewCustomer: result.created },
      request,
    });

    return json({ customerId: result.customerId, created: result.created });
  } catch (error) {
    return handleApiError(error);
  }
}
