import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { badRequest, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/constants";

type Params = { params: Promise<{ token: string }> };

/** Accept an invitation — the signed-in user's email must match the invite. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { token } = await params;
    const user = await requireUserApi();

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, deletedAt: true } } },
    });

    if (!invitation || invitation.workspace.deletedAt) throw notFound("Invitation not found");
    if (invitation.status === "revoked") throw badRequest("This invitation was revoked.");
    if (invitation.status === "accepted") throw badRequest("This invitation was already used.");
    if (invitation.status === "expired" || invitation.expiresAt < new Date()) {
      if (invitation.status === "pending") {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "expired" },
        });
      }
      throw badRequest("This invitation has expired. Ask for a new one.");
    }
    if (invitation.email !== user.email.toLowerCase()) {
      throw badRequest("This invitation was sent to a different email address.");
    }

    const existing = await prisma.workspaceMember.findFirst({
      where: { workspaceId: invitation.workspaceId, userId: user.id },
    });

    if (existing) {
      // Idempotent: already a member — close out the invitation.
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
    } else {
      await prisma.$transaction([
        prisma.workspaceMember.create({
          data: {
            workspaceId: invitation.workspaceId,
            userId: user.id,
            role: invitation.role,
            invitedById: invitation.invitedById,
          },
        }),
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "accepted", acceptedAt: new Date() },
        }),
      ]);

      await recordAuditEvent({
        action: "member_joined",
        workspaceId: invitation.workspaceId,
        userId: user.id,
        entityType: "invitation",
        entityId: invitation.id,
        metadata: { role: invitation.role },
        request,
      });
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, invitation.workspaceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return json({ ok: true, workspaceId: invitation.workspaceId });
  } catch (error) {
    return handleApiError(error);
  }
}
