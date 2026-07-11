import { handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { getManifestForMember } from "@/lib/guides/manifest";

type Params = { params: Promise<{ id: string }> };

/**
 * "Guide sees only assigned departures" (docs/02 §6 AC) — scoped entirely
 * by `Availability.guideId === the caller's own membership id`, not by
 * role. Any active member of the workspace may call this; see docs/21 §6.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);

    const departures = await getManifestForMember(id, membership.id);
    return json({ departures });
  } catch (error) {
    return handleApiError(error);
  }
}
