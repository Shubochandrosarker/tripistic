import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateWorkspaceSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    const workspace = membership.workspace;

    return json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        businessType: workspace.businessType,
        timezone: workspace.timezone,
        currency: workspace.currency,
        country: workspace.country,
        status: workspace.status,
        trialEndsAt: workspace.trialEndsAt,
        createdAt: workspace.createdAt,
      },
      role: membership.role,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);

    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can update settings.");
    }

    const body = await request.json().catch(() => null);
    const data = updateWorkspaceSchema.parse(body);

    const workspace = await prisma.workspace.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.businessType !== undefined ? { businessType: data.businessType } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.country !== undefined ? { country: data.country ?? null } : {}),
      },
    });

    await recordAuditEvent({
      action: "workspace_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace",
      entityId: id,
      metadata: { fields: Object.keys(data).join(",") },
      request,
    });

    return json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        businessType: workspace.businessType,
        timezone: workspace.timezone,
        currency: workspace.currency,
        country: workspace.country,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
