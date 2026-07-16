import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageWorkforce, canViewWorkforce } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createGuideRatingSchema } from "@/lib/validation";
import { averageRating, createRating, listRatings } from "@/lib/workforce/service";

type Params = { params: Promise<{ id: string; memberId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewWorkforce(membership.role)) {
      throw forbidden("You do not have permission to view ratings.");
    }
    const [ratings, average] = await Promise.all([listRatings(id, memberId), averageRating(id, memberId)]);
    return json({ ratings, average });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id, memberId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageWorkforce(membership.role)) {
      throw forbidden("Only workspace owners and admins can record ratings.");
    }

    const body = await request.json().catch(() => null);
    const data = createGuideRatingSchema.parse(body);
    const rating = await createRating(id, memberId, { ...data, createdById: user.id });

    await recordAuditEvent({
      action: "guide_rating_created",
      workspaceId: id,
      userId: user.id,
      entityType: "guide_rating",
      entityId: rating.id,
      metadata: { memberId, ratingValue: rating.ratingValue },
      request,
    });

    return json({ rating }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
