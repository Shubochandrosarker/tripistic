import { z } from "zod";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/auth/permissions";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { createBillingCheckoutSession } from "@/lib/billing/stripe-billing";

const checkoutSchema = z.object({
  planSlug: z.enum(["solo", "operator", "agency"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can manage billing.");
    }

    const body = await request.json().catch(() => null);
    const data = checkoutSchema.parse(body);
    const session = await createBillingCheckoutSession({
      workspace: active.workspace,
      user,
      planSlug: data.planSlug,
      interval: data.interval,
    });

    return json({ checkoutUrl: session.url });
  } catch (error) {
    return handleApiError(error);
  }
}
