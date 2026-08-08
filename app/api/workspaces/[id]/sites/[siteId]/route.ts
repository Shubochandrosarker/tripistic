import { z } from "zod";

import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { unpublishSite } from "@/lib/sites/publish";
import { deleteSite, getSite, updateSiteSettings } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string }> };

const updateSiteSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  theme: z.unknown().optional(),
  seo: z.unknown().optional(),
  navigation: z.unknown().optional(),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });

    const site = await getSite(id, siteId);
    const revisions = await prisma.siteRevision.findMany({
      where: { siteId, workspaceId: id },
      orderBy: { versionNumber: "desc" },
      take: 20,
      select: { id: true, versionNumber: true, note: true, createdAt: true, checksum: true },
    });
    const deployments = await prisma.siteDeployment.findMany({
      where: { siteId, workspaceId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return noStoreJson({ site, revisions, deployments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can change website settings.");
    }

    const data = updateSiteSchema.parse(await request.json().catch(() => null));
    const site = await updateSiteSettings({
      workspaceId: id,
      userId: user.id,
      siteId,
      ...data,
      request,
    });
    return json({ site });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can delete a website.");
    }

    // Take the site off the edge first. If the teardown fails the record stays
    // — a live Worker with no database row behind it is unreachable to
    // support and invisible to the operator.
    await unpublishSite(id, siteId);
    const site = await deleteSite({ workspaceId: id, userId: user.id, siteId, request });
    return json({ site });
  } catch (error) {
    return handleApiError(error);
  }
}
