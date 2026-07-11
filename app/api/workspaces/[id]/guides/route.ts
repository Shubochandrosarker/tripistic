import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewGuides } from "@/lib/auth/permissions";
import { listGuides } from "@/lib/guides/service";

type Params = { params: Promise<{ id: string }> };

/** Active members + their guide profile (certifications/notes), for the Guides management page. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewGuides(membership.role)) {
      throw forbidden("You do not have permission to view guides.");
    }

    const members = await listGuides(id);
    return json({
      guides: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        certifications: member.guideProfile?.certifications ?? [],
        notes: member.guideProfile?.notes ?? null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
