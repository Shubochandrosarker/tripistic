import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { getMemberships } from "@/lib/tenancy/workspace";

export async function GET() {
  try {
    const user = await requireUserApi();
    const memberships = await getMemberships(user.id);

    return json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        isPlatformAdmin: user.isPlatformAdmin,
        createdAt: user.createdAt,
      },
      memberships: memberships.map((membership) => ({
        workspaceId: membership.workspaceId,
        workspaceName: membership.workspace.name,
        workspaceSlug: membership.workspace.slug,
        role: membership.role,
        joinedAt: membership.joinedAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
