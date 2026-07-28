import { z } from "zod";
import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageBilling } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { createSubscriptionChangePreview } from "@/lib/billing/subscription-lifecycle";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";

const previewSchema = z.object({
  planSlug: z.enum(["solo", "operator", "agency"]),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
});

export async function POST(request: Request) {
  try {
    const user = await requireUserApi();
    const active = await getActiveWorkspace(user.id);
    if (!active || !canManageBilling(active.role)) {
      throw forbidden("Only the workspace owner can preview billing changes.");
    }

    const body = await request.json().catch(() => null);
    const data = previewSchema.parse(body);
    const preview = await createSubscriptionChangePreview(
      active.workspace.id,
      data.planSlug,
      data.interval,
    );

    return json({ preview });
  } catch (error) {
    return handleApiError(error);
  }
}
