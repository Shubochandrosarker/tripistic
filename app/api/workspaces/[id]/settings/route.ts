import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateSettingsSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

/** Workspace key-value settings (allow-listed keys only). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);

    const settings = await prisma.setting.findMany({
      where: { workspaceId: id },
      orderBy: { key: "asc" },
    });

    return json({
      settings: settings.map((setting) => ({
        key: setting.key,
        value: setting.value,
        type: setting.type,
        updatedAt: setting.updatedAt,
      })),
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
    const data = updateSettingsSchema.parse(body);

    await prisma.$transaction(
      data.settings.map((entry) =>
        prisma.setting.upsert({
          where: { workspaceId_key: { workspaceId: id, key: entry.key } },
          create: { workspaceId: id, key: entry.key, value: entry.value },
          update: { value: entry.value },
        }),
      ),
    );

    await recordAuditEvent({
      action: "settings_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "settings",
      metadata: { keys: data.settings.map((entry) => entry.key).join(",") },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
