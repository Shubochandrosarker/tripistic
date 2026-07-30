import { z } from "zod";

import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { setWorkspaceStatus } from "@/lib/admin/platform-actions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["active", "suspended"]) });

/** Suspend or reactivate a workspace. Reversible; nothing is deleted. */
export async function PATCH(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
  try {
    const admin = await requirePlatformAdminApi();
    const { workspaceId } = await params;
    const { status } = bodySchema.parse(await request.json().catch(() => null));

    const result = await setWorkspaceStatus(workspaceId, status, { actorId: admin.id, request });
    return json({ ok: true, workspace: result.workspace, changed: result.changed });
  } catch (error) {
    return handleApiError(error);
  }
}
