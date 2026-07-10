import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";

type Params = { params: Promise<{ id: string; blackoutId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, blackoutId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage availability.");
    }

    const blackout = await prisma.blackoutDate.findFirst({
      where: { id: blackoutId, workspaceId: id },
    });
    if (!blackout) throw notFound("Blackout date not found");

    await prisma.blackoutDate.delete({ where: { id: blackout.id } });

    await recordAuditEvent({
      action: "blackout_deleted",
      workspaceId: id,
      userId: user.id,
      entityType: "blackout_date",
      entityId: blackout.id,
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
