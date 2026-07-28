import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { disableCustomDomain } from "@/lib/domains/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; domainId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, domainId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can remove domains.");
    }

    const domain = await disableCustomDomain({ workspaceId: id, domainId });
    await recordAuditEvent({
      action: "custom_domain_disabled",
      workspaceId: id,
      userId: user.id,
      entityType: "custom_domain",
      entityId: domain.id,
      metadata: { hostname: domain.hostname },
      request,
    });

    return json({ domain });
  } catch (error) {
    return handleApiError(error);
  }
}
