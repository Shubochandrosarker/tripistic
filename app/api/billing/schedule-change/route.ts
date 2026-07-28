import { z } from "zod";
import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageBilling } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { scheduleSubscriptionChange } from "@/lib/billing/subscription-lifecycle";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";

const scheduleChangeSchema = z.object({
  planSlug: z.enum(["solo", "operator", "agency"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can schedule billing changes.");
    }

    const body = await request.json().catch(() => null);
    const data = scheduleChangeSchema.parse(body);
    const change = await scheduleSubscriptionChange({
      workspaceId: active.workspace.id,
      requestedById: user.id,
      planSlug: data.planSlug,
      interval: data.interval,
    });

    return json({ change });
  } catch (error) {
    return handleApiError(error);
  }
}
