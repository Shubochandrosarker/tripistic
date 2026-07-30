import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { getStorefrontForWorkspace, saveStorefrontDraft } from "@/lib/storefront/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "white_label" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the storefront.");
    }

    const storefront = await getStorefrontForWorkspace(id);
    return noStoreJson({ storefront });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "white_label" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage the storefront.");
    }

    const body = await request.json().catch(() => null);
    const storefront = await saveStorefrontDraft({ workspaceId: id, userId: user.id, input: body });

    await recordAuditEvent({
      action: "storefront_draft_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace_storefront",
      entityId: storefront.id,
      request,
    });

    return json({ storefront });
  } catch (error) {
    return handleApiError(error);
  }
}
