import { z } from "zod";

import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { createSite, listSites } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

const createSiteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  templateKey: z.string().trim().min(1).max(60),
  subdomain: z.string().trim().min(3).max(63).optional(),
});

/** Websites belonging to this workspace. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    return noStoreJson({ sites: await listSites(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can create a website.");
    }

    const data = createSiteSchema.parse(await request.json().catch(() => null));
    const site = await createSite({
      workspaceId: id,
      userId: user.id,
      name: data.name,
      templateKey: data.templateKey,
      subdomain: data.subdomain,
      request,
    });
    return json({ site }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
