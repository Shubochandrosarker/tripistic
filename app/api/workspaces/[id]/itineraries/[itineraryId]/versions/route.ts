import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageItineraries, canViewItineraries } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createItineraryVersionSchema } from "@/lib/validation";
import { listItineraryVersions, saveItineraryVersion } from "@/lib/itinerary/service";

type Params = { params: Promise<{ id: string; itineraryId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, itineraryId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canViewItineraries(membership.role)) {
      throw forbidden("You do not have permission to view itinerary versions.");
    }
    const versions = await listItineraryVersions(id, itineraryId);
    return json({
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        note: v.note,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Snapshots the current itinerary state as a new version. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, itineraryId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "itinerary_builder" });
    if (!canManageItineraries(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can save versions.");
    }

    const body = await request.json().catch(() => ({}));
    const data = createItineraryVersionSchema.parse(body ?? {});
    const version = await saveItineraryVersion(id, itineraryId, data.note, user.id);

    await recordAuditEvent({
      action: "itinerary_version_saved",
      workspaceId: id,
      userId: user.id,
      entityType: "itinerary_version",
      entityId: version.id,
      metadata: { itineraryId, versionNumber: version.versionNumber },
      request,
    });

    return json({ versionNumber: version.versionNumber }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
