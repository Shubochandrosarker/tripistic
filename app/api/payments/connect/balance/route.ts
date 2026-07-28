import { forbidden, handleApiError, noStoreJson } from "@/lib/api";
import { canManageBilling } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { getConnectedAccountBalance } from "@/lib/payments/connect";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";

export async function GET() {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can view payout balances.");
    }

    const balance = await getConnectedAccountBalance(active.workspace.id);
    return noStoreJson({ balance });
  } catch (error) {
    return handleApiError(error);
  }
}
