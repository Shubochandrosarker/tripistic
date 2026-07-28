import { z } from "zod";
import { forbidden, handleApiError, json, noStoreJson } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createCustomDomain } from "@/lib/domains/service";
import { prisma } from "@/lib/db";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  hostname: z.string().trim().min(1).max(253),
  redirectToWww: z.boolean().optional().default(false),
});

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage domains.");
    }

    const domains = await prisma.customDomain.findMany({
      where: { workspaceId: id },
      orderBy: { createdAt: "desc" },
    });
    return noStoreJson({ domains });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage domains.");
    }

    const data = createSchema.parse(await request.json().catch(() => null));
    const domain = await createCustomDomain({ workspaceId: id, hostname: data.hostname, redirectToWww: data.redirectToWww });

    await recordAuditEvent({
      action: "custom_domain_created",
      workspaceId: id,
      userId: user.id,
      entityType: "custom_domain",
      entityId: domain.id,
      metadata: { hostname: domain.hostname },
      request,
    });

    return json({ domain }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
