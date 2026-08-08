import { z } from "zod";

import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { getSite, reorderSitePages } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string }> };

const reorderSchema = z.object({ orderedPageIds: z.array(z.string().min(1)).min(1).max(200) });

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can reorder pages.");
    }

    const data = reorderSchema.parse(await request.json().catch(() => null));
    await reorderSitePages({ workspaceId: id, siteId, orderedPageIds: data.orderedPageIds });
    const site = await getSite(id, siteId);
    return json({ pages: site.pages });
  } catch (error) {
    return handleApiError(error);
  }
}
