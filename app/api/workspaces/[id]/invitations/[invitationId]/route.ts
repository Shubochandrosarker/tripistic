import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageMembers } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";

type Params = { params: Promise<{ id: string; invitationId: string }> };

/** Revoke a pending invitation. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, invitationId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageMembers(membership.role)) {
      throw forbidden("Only workspace owners and admins can revoke invitations.");
    }

    const invitation = await prisma.invitation.findFirst({
      where: { id: invitationId, workspaceId: id },
    });
    if (!invitation || invitation.status !== "pending") {
      throw notFound("Invitation not found");
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "revoked" },
    });

    await recordAuditEvent({
      action: "member_invitation_revoked",
      workspaceId: id,
      userId: user.id,
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email: invitation.email },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
