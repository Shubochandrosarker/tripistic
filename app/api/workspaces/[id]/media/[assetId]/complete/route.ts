import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { completeMediaUpload } from "@/lib/media/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; assetId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, assetId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can upload media.");
    }

    const body = await request.json().catch(() => null);
    const asset = await completeMediaUpload({ workspaceId: id, assetId, input: body });

    await recordAuditEvent({
      action: "media_upload_completed",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace_media_asset",
      entityId: asset.id,
      metadata: { contentType: asset.contentType, byteSize: asset.byteSize },
      request,
    });

    return json({ asset });
  } catch (error) {
    return handleApiError(error);
  }
}
