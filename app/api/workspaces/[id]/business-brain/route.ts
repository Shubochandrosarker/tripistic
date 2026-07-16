import { forbidden, handleApiError, noStoreJson } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewBusinessBrain } from "@/lib/auth/permissions";
import { computeBusinessBrainReport } from "@/lib/analytics/business-brain";

type Params = { params: Promise<{ id: string }> };

/** Revenue forecast, occupancy, cancellation/repeat rates, and rule-based suggestions — the "AI Business Brain". */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewBusinessBrain(membership.role)) {
      throw forbidden("Only workspace owners and admins can view the business brain.");
    }
    const report = await computeBusinessBrainReport(id);
    return noStoreJson(report);
  } catch (error) {
    return handleApiError(error);
  }
}
