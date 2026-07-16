import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createLeadSchema, leadListQuerySchema } from "@/lib/validation";
import { createLead, listLeads } from "@/lib/crm/leads";
import { serializeLead } from "@/lib/crm/serializers";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewCrm(membership.role)) {
      throw forbidden("You do not have permission to view leads.");
    }

    const url = new URL(request.url);
    const query = leadListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { leads, total } = await listLeads(id, query);
    return json({ leads: leads.map(serializeLead), total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage leads.");
    }

    const body = await request.json().catch(() => null);
    const data = createLeadSchema.parse(body);
    const lead = await createLead(id, { ...data, createdById: user.id });

    await recordAuditEvent({
      action: "lead_created",
      workspaceId: id,
      userId: user.id,
      entityType: "lead",
      entityId: lead.id,
      metadata: { name: lead.name, status: lead.status },
      request,
    });

    return json({ lead: serializeLead(lead) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
