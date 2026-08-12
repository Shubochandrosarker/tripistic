import { z } from "zod";

import { badRequest, handleApiError, json, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ siteId: string }> };

const statusSchema = z.object({
  action: z.enum(["suspend", "reactivate"]),
  /**
   * Required, not optional. Suspending a customer's website is a destructive
   * act against a live business, and an audit row that says only "an admin did
   * this" cannot answer the question that gets asked afterwards.
   */
  reason: z.string().trim().min(4).max(500),
});

/**
 * Platform-admin suspend / reactivate for a tenant site.
 *
 * Suspension takes effect at the edge without a deployment: `resolveSiteRoute`
 * refuses to route a suspended site, so the dispatch Worker stops serving it as
 * soon as its routing cache expires. That is deliberate — an abuse response
 * that requires a successful Worker deletion is an abuse response that fails
 * when Cloudflare is having a bad day.
 *
 * Reactivation restores the previous status rather than assuming `published`:
 * a site suspended while still a draft must not come back live.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await requirePlatformAdminApi();
    const { siteId } = await params;
    const data = statusSchema.parse(await request.json().catch(() => null));

    const site = await prisma.site.findFirst({
      where: { id: siteId, deletedAt: null },
      select: { id: true, workspaceId: true, status: true, publishedRevisionId: true },
    });
    if (!site) throw notFound("Site not found.");

    if (data.action === "suspend" && site.status === "suspended") {
      throw badRequest("This site is already suspended.");
    }
    if (data.action === "reactivate" && site.status !== "suspended") {
      throw badRequest("This site is not suspended.");
    }

    const nextStatus =
      data.action === "suspend"
        ? ("suspended" as const)
        : site.publishedRevisionId
          ? ("published" as const)
          : ("draft" as const);

    const updated = await prisma.site.update({
      where: { id: site.id },
      data: { status: nextStatus },
    });

    await recordAuditEvent({
      action: data.action === "suspend" ? "admin_site_suspended" : "admin_site_reactivated",
      workspaceId: site.workspaceId,
      userId: admin.id,
      entityType: "site",
      entityId: site.id,
      metadata: { from: site.status, to: nextStatus, reason: data.reason },
      request,
    });

    return json({ site: { id: updated.id, status: updated.status } });
  } catch (error) {
    return handleApiError(error);
  }
}
