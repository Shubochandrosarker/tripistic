import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createMediaUploadIntent } from "@/lib/media/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can upload media.");
    }

    const body = await request.json().catch(() => null);
    const result = await createMediaUploadIntent({ workspaceId: id, userId: user.id, input: body });

    await recordAuditEvent({
      action: "media_upload_started",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace_media_asset",
      entityId: result.asset.id,
      metadata: { contentType: result.asset.contentType, byteSize: result.asset.byteSize },
      request,
    });

    return json(result, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
