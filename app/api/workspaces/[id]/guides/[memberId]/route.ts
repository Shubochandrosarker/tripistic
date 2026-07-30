import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkforce } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateWorkforceProfileSchema } from "@/lib/validation";
import { upsertGuideProfile } from "@/lib/guides/service";

type Params = { params: Promise<{ id: string; memberId: string }> };

/**
 * Upserts a member's workforce profile — created lazily on first write.
 * Accepts both the original certifications/notes fields (Phase 6) and the
 * extended workforce fields (Phase 6 extended: kind, languages, skills,
 * employment type, phone, pay rate, active) in one PATCH — same
 * permission tier (`canManageGuides` === `canManageWorkforce`).
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "guide_scheduling" });
    if (!canManageWorkforce(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage guide profiles.");
    }

    const body = await request.json().catch(() => null);
    const data = updateWorkforceProfileSchema.parse(body);

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
        kind: profile.kind,
        languages: profile.languages,
        skills: profile.skills,
        employmentType: profile.employmentType,
        phone: profile.phone,
        hourlyRateCents: profile.hourlyRateCents,
        active: profile.active,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
