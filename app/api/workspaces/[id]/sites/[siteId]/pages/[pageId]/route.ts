import { z } from "zod";

import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { deleteSitePage, getSitePage, updateSitePage } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string; pageId: string }> };

const updatePageSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  path: z.string().trim().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  content: z.unknown().optional(),
  seo: z.unknown().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId, pageId } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    return noStoreJson({ page: await getSitePage(id, siteId, pageId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId, pageId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can edit pages.");
    }

    const data = updatePageSchema.parse(await request.json().catch(() => null));
    const page = await updateSitePage({ workspaceId: id, siteId, pageId, ...data });
    return json({ page });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId, pageId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can delete pages.");
    }
    await deleteSitePage({ workspaceId: id, siteId, pageId });
    return json({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
