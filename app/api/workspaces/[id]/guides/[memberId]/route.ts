import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageGuides } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateGuideProfileSchema } from "@/lib/validation";
import { upsertGuideProfile } from "@/lib/guides/service";

type Params = { params: Promise<{ id: string; memberId: string }> };

/** Upserts certifications/notes for a member — created lazily on first write. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageGuides(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage guide profiles.");
    }

    const body = await request.json().catch(() => null);
    const data = updateGuideProfileSchema.parse(body);

    const profile = await upsertGuideProfile(id, memberId, data);

    await recordAuditEvent({
      action: "guide_profile_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "guide_profile",
      entityId: profile.id,
      metadata: { memberId, fields: Object.keys(data).join(",") },
      request,
    });

    return json({
      guideProfile: {
        memberId: profile.memberId,
        certifications: profile.certifications,
        notes: profile.notes,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
