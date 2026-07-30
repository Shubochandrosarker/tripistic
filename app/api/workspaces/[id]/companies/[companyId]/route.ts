import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageCrm, canViewCrm } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateCompanySchema } from "@/lib/validation";
import { archiveCompany, requireCompany, updateCompany } from "@/lib/crm/companies";
import { serializeCompany } from "@/lib/crm/serializers";

type Params = { params: Promise<{ id: string; companyId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, companyId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canViewCrm(membership.role)) {
      throw forbidden("You do not have permission to view companies.");
    }
    const company = await requireCompany(id, companyId);
    return json({ company: serializeCompany(company) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, companyId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage companies.");
    }

    const body = await request.json().catch(() => null);
    const data = updateCompanySchema.parse(body);
    const company = await updateCompany(id, companyId, data);

    await recordAuditEvent({
      action: "company_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "company",
      entityId: company.id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({ company: serializeCompany(company) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, companyId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "crm_pipeline" });
    if (!canManageCrm(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can manage companies.");
    }

    const company = await archiveCompany(id, companyId);

    await recordAuditEvent({
      action: "company_archived",
      workspaceId: id,
      userId: user.id,
      entityType: "company",
      entityId: company.id,
      metadata: { name: company.name },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
