import { forbidden, handleApiError, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { listMediaAssets } from "@/lib/media/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can view the media library.");
    }

    const assets = await listMediaAssets(id);
    return noStoreJson({ assets });
  } catch (error) {
    return handleApiError(error);
  }
}
