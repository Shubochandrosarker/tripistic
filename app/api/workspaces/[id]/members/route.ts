import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

/** Members of the workspace (any active member may view the roster). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { joinedAt: "asc" },
    });

    return json({
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: member.user.avatarUrl,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
