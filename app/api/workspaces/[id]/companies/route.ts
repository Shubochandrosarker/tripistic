import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { companyListQuerySchema, companySchema } from "@/lib/validation";
import { createCompany, listCompanies } from "@/lib/crm/companies";
import { serializeCompany } from "@/lib/crm/serializers";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canViewCrm(membership.role)) {
      throw forbidden("You do not have permission to view companies.");
    }

    const url = new URL(request.url);
    const query = companyListQuerySchema.parse({
      kind: url.searchParams.get("kind") || undefined,
      search: url.searchParams.get("search") || undefined,
      page: url.searchParams.get("page") || undefined,
      pageSize: url.searchParams.get("pageSize") || undefined,
    });

    const { companies, total } = await listCompanies(id, query);
    return json({
      companies: companies.map(serializeCompany),
      total,
      page: query.page,
      pageSize: query.pageSize,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage companies.");
    }

    const body = await request.json().catch(() => null);
    const data = companySchema.parse(body);
    const company = await createCompany(id, data);

    await recordAuditEvent({
      action: "company_created",
      workspaceId: id,
      userId: user.id,
      entityType: "company",
      entityId: company.id,
      metadata: { name: company.name, kind: company.kind },
      request,
    });

    return json({ company: serializeCompany(company) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
