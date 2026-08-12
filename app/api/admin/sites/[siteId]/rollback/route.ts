import { z } from "zod";

import { conflict, handleApiError, json, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { rollbackSite } from "@/lib/sites/publish";

type Params = { params: Promise<{ siteId: string }> };

const rollbackSchema = z.object({
  revisionId: z.string().trim().min(1).max(64).optional(),
  reason: z.string().trim().min(4).max(500),
});

/**
 * Force-rollback of a tenant site by a platform admin.
 *
 * Exists for the case support actually hits: a customer's publish shipped
 * something broken or abusive and they are unreachable. Without it the only
 * remedies are suspension — which takes the whole site down — or waiting.
 *
 * Reuses `rollbackSite` rather than reimplementing it. A second rollback path
 * would be a second place for the "restore the draft pages from the snapshot"
 * step to be forgotten, and the symptom of forgetting it is an editor showing
 * content that silently differs from what is live.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await requirePlatformAdminApi();
    const { siteId } = await params;
    const data = rollbackSchema.parse(await request.json().catch(() => null));

    const site = await prisma.site.findFirst({
      where: { id: siteId, deletedAt: null },
      select: { id: true, workspaceId: true },
    });
    if (!site) throw notFound("Site not found.");

    // Default to the revision behind the newest one. Rolling back to the
    // current revision would be a no-op presented as a fix.
    const revisionId =
      data.revisionId ??
      (
        await prisma.siteRevision.findMany({
          where: { siteId: site.id },
          orderBy: { versionNumber: "desc" },
          take: 2,
          select: { id: true },
        })
      )[1]?.id;

    if (!revisionId) throw conflict("There is no earlier revision to roll back to.");

    const result = await rollbackSite({
      workspaceId: site.workspaceId,
      // Attributed to the admin, in the tenant's own audit trail. An operator
      // reading their history must be able to see that Tripistic did this.
      userId: admin.id,
      siteId: site.id,
      revisionId,
      request,
    });

    await recordAuditEvent({
      action: "admin_site_rolled_back",
      workspaceId: site.workspaceId,
      userId: admin.id,
      entityType: "site",
      entityId: site.id,
      metadata: { revisionId, reason: data.reason, status: result.status },
      request,
    });

    return json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
