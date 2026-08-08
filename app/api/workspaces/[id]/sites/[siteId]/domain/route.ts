import { z } from "zod";

import { conflict, forbidden, handleApiError, json, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getSite } from "@/lib/sites/service";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string }> };

const bindSchema = z.object({ domainId: z.string().trim().min(1).max(64) });

/**
 * Binds an already-verified custom domain to a site.
 *
 * Deliberately separate from domain creation. Adding a hostname is a DNS and
 * TLS lifecycle that can take hours; choosing which site it serves is an
 * instant decision the operator may change afterwards. Coupling them would
 * mean re-verifying a domain to point it at a different site.
 *
 * The domain is re-read scoped to the workspace, so a domainId belonging to
 * another tenant resolves to nothing rather than being bound.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "custom_domain" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can bind a domain.");
    }

    const data = bindSchema.parse(await request.json().catch(() => null));
    await getSite(id, siteId);

    const domain = await prisma.customDomain.findFirst({
      where: { id: data.domainId, workspaceId: id },
    });
    if (!domain) throw notFound("Domain not found.");
    if (domain.status === "disabled") throw conflict("This domain is disabled.");

    const updated = await prisma.customDomain.update({
      where: { id: domain.id },
      data: { siteId, cacheInvalidatedAt: new Date() },
    });

    await recordAuditEvent({
      action: "site_domain_bound",
      workspaceId: id,
      userId: user.id,
      entityType: "custom_domain",
      entityId: domain.id,
      metadata: { siteId, hostname: domain.hostname },
      request,
    });

    return json({ domain: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "custom_domain" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can unbind a domain.");
    }

    // Unbinds every domain pointing at this site. The hostname and its
    // certificate survive — see the ON DELETE SET NULL note on the model.
    const result = await prisma.customDomain.updateMany({
      where: { workspaceId: id, siteId },
      data: { siteId: null, cacheInvalidatedAt: new Date() },
    });

    await recordAuditEvent({
      action: "site_domain_unbound",
      workspaceId: id,
      userId: user.id,
      entityType: "site",
      entityId: siteId,
      metadata: { unbound: result.count },
      request,
    });

    return json({ unbound: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}
