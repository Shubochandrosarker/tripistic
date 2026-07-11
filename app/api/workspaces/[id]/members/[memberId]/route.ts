import { prisma } from "@/lib/db";
import { badRequest, forbidden, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { countActiveOwners, requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import {
  canManageMembers,
  canModifyMemberWithRole,
  grantableRoles,
} from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateMemberSchema } from "@/lib/validation";
import { clearGuideAssignments } from "@/lib/guides/service";

type Params = { params: Promise<{ id: string; memberId: string }> };

async function loadActorAndTarget(userId: string, workspaceId: string, memberId: string) {
  const actor = await requireWorkspaceAccess(userId, workspaceId);
  if (!canManageMembers(actor.role)) {
    throw forbidden("Only workspace owners and admins can manage members.");
  }
  const target = await prisma.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!target) throw notFound("Member not found");
  return { actor, target };
}

/** Change a member's role. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const { actor, target } = await loadActorAndTarget(user.id, id, memberId);

    if (target.userId === user.id) {
      throw badRequest("You cannot change your own role. Ask another owner to do it.");
    }
    if (!canModifyMemberWithRole(actor.role, target.role)) {
      throw forbidden("You cannot manage a member with that role.");
    }

    const body = await request.json().catch(() => null);
    const data = updateMemberSchema.parse(body);

    if (!grantableRoles(actor.role).includes(data.role)) {
      throw forbidden("You cannot grant that role.");
    }

    // Last-owner protection: a workspace must always keep one active owner.
    if (target.role === "workspace_owner" && data.role !== "workspace_owner") {
      const owners = await countActiveOwners(id);
      if (owners <= 1) {
        throw badRequest("A workspace must keep at least one owner. Promote someone else first.");
      }
    }

    const previousRole = target.role;
    const updated = await prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role: data.role },
    });

    await recordAuditEvent({
      action: "member_role_changed",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace_member",
      entityId: target.id,
      metadata: { memberEmail: target.user.email, from: previousRole, to: data.role },
      request,
    });

    return json({ member: { id: updated.id, role: updated.role } });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Remove a member from the workspace. */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const { actor, target } = await loadActorAndTarget(user.id, id, memberId);

    if (target.userId === user.id) {
      throw badRequest("You cannot remove yourself from the workspace.");
    }
    if (!canModifyMemberWithRole(actor.role, target.role)) {
      throw forbidden("You cannot remove a member with that role.");
    }
    if (target.role === "workspace_owner") {
      const owners = await countActiveOwners(id);
      if (owners <= 1) {
        throw badRequest("A workspace must keep at least one owner.");
      }
    }

    // Availability.guide is onDelete: Restrict (a composite FK can't null a
    // required workspace_id column) — clear this member's assignments first
    // in the same transaction so removing a former guide never fails.
    const clearedGuideAssignments = await prisma.$transaction(async (tx) => {
      const cleared = await clearGuideAssignments(tx, id, target.id);
      await tx.workspaceMember.delete({ where: { id: target.id } });
      return cleared;
    });

    await recordAuditEvent({
      action: "member_removed",
      workspaceId: id,
      userId: user.id,
      entityType: "workspace_member",
      entityId: target.id,
      metadata: { memberEmail: target.user.email, role: target.role, clearedGuideAssignments },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
