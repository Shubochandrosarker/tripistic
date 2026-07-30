import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { publishStorefront } from "@/lib/storefront/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "white_label" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can publish the storefront.");
    }

    const body = await request.json().catch(() => undefined);
    const storefront = await publishStorefront({ workspaceId: id, userId: user.id, input: body });

    await recordAuditEvent({
      action: "storefront_published",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace_storefront",
      entityId: storefront?.id,
      metadata: { version: storefront?.publishedVersion ?? null },
      request,
    });

    return json({ storefront });
  } catch (error) {
    return handleApiError(error);
  }
}
