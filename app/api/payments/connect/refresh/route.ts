import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageBilling } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { refreshWorkspacePaymentAccount } from "@/lib/payments/connect";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can refresh payout status.");
    }

    const paymentAccount = await refreshWorkspacePaymentAccount(active.workspace.id);
    if (paymentAccount) {
      await recordAuditEvent({
        action: "payment_account_synced",
        workspaceId: active.workspace.id,
        userId: user.id,
        entityType: "workspace_payment_account",
        entityId: paymentAccount.id,
        metadata: { provider: "stripe", status: paymentAccount.status },
        request,
      });
    }

    return json({ paymentAccount });
  } catch (error) {
    return handleApiError(error);
  }
}
