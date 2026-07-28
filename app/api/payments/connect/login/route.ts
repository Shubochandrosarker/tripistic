import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageBilling } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { createConnectLoginLink } from "@/lib/payments/connect";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";

export async function POST() {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can open the Stripe dashboard.");
    }

    const link = await createConnectLoginLink(active.workspace.id);
    return json({ loginUrl: link.url });
  } catch (error) {
    return handleApiError(error);
  }
}
