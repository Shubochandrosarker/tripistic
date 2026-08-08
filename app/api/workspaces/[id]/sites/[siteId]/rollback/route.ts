import { z } from "zod";

import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { rollbackSite } from "@/lib/sites/publish";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string }> };

const rollbackSchema = z.object({ revisionId: z.string().trim().min(1).max(64) });

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can roll back a website.");
    }

    const data = rollbackSchema.parse(await request.json().catch(() => null));
    const result = await rollbackSite({
      workspaceId: id,
      userId: user.id,
      siteId,
      revisionId: data.revisionId,
      request,
    });
    return json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
