import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { conflict, forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageMembers, grantableRoles } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { inviteMemberSchema } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

const INVITATION_TTL_DAYS = 7;

function inviteUrlFor(request: Request, token: string) {
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}

/** Pending invitations (owner/admin only). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageMembers(membership.role)) {
      throw forbidden("Only workspace owners and admins can view invitations.");
    }

    // Opportunistically expire stale invitations.
    await prisma.invitation.updateMany({
      where: { workspaceId: id, status: "pending", expiresAt: { lt: new Date() } },
      data: { status: "expired" },
    });

    const invitations = await prisma.invitation.findMany({
      where: { workspaceId: id, status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    return json({
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create an invitation. Email delivery is stubbed until Phase 5 — the invite link is returned. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageMembers(membership.role)) {
      throw forbidden("Only workspace owners and admins can invite members.");
    }

    const body = await request.json().catch(() => null);
    const data = inviteMemberSchema.parse(body);

    if (!grantableRoles(membership.role).includes(data.role)) {
      throw forbidden("You cannot grant that role.");
    }

    const existingMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId: id, user: { email: data.email } },
    });
    if (existingMember) {
      throw conflict("That person is already a member of this workspace.");
    }

    const existingInvitation = await prisma.invitation.findFirst({
      where: {
        workspaceId: id,
        email: data.email,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    });
    if (existingInvitation) {
      throw conflict("An invitation for that email is already pending. Revoke it to resend.");
    }

    const token = randomBytes(32).toString("hex");
    const invitation = await prisma.invitation.create({
      data: {
        workspaceId: id,
        email: data.email,
        role: data.role,
        token,
        invitedById: user.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    await recordAuditEvent({
      action: "member_invited",
      workspaceId: id,
      userId: user.id,
      entityType: "invitation",
      entityId: invitation.id,
      metadata: { email: data.email, role: data.role },
      request,
    });

    // Phase 5 will send this by email; until then the operator shares the link.
    return json(
      {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        },
        inviteUrl: inviteUrlFor(request, token),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
