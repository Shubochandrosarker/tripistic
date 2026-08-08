import { z } from "zod";

import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { createSitePage, getSite } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string }> };

const createPageSchema = z.object({
  path: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(120),
  content: z.unknown().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    const site = await getSite(id, siteId);
    return noStoreJson({ pages: site.pages });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can add pages.");
    }

    const data = createPageSchema.parse(await request.json().catch(() => null));
    const page = await createSitePage({ workspaceId: id, userId: user.id, siteId, ...data });
    return json({ page }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
