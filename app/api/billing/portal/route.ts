import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { createBillingPortalSession } from "@/lib/billing/stripe-billing";

export async function POST() {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can manage billing.");
    }

    const session = await createBillingPortalSession(active.workspace);
    return json({ portalUrl: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
