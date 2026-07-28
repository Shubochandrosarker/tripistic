import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageBilling } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createConnectOnboardingLink } from "@/lib/payments/connect";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can manage payout setup.");
    }

    const result = await createConnectOnboardingLink({ workspace: active.workspace, user });

    await recordAuditEvent({
      action: "payment_account_onboarding_started",
      workspaceId: active.workspace.id,
      userId: user.id,
      entityType: "workspace_payment_account",
      entityId: result.paymentAccount.id,
      metadata: { provider: "stripe" },
      request,
    });

    return json({ onboardingUrl: result.url });
  } catch (error) {
    return handleApiError(error);
  }
}
