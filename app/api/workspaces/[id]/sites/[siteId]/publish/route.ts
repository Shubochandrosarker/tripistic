import { z } from "zod";

import { forbidden, handleApiError, json } from "@/lib/api";
import { canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserApi } from "@/lib/auth/session";
import { publishSite } from "@/lib/sites/publish";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string; siteId: string }> };

const publishSchema = z.object({
  note: z.string().trim().max(200).optional(),
  preview: z.boolean().optional(),
});

/**
 * Publishing is owner/admin only and always explicit.
 *
 * There is no auto-publish on save anywhere in the Site Builder, and the AI
 * tool layer cannot reach this route: publishing is classified STRONG_CONFIRM
 * and goes through a human. A model that could publish is a model that could
 * put an untrue claim about a business in front of that business's customers.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUserApi();
    const { id, siteId } = await params;
    const membership = await requireWorkspaceAccess(user.id, id, { feature: "storefront_builder" });
    if (!canManageWorkspace(membership.role)) {
      throw forbidden("Only workspace owners and admins can publish a website.");
    }

    const data = publishSchema.parse((await request.json().catch(() => null)) ?? {});
    const result = await publishSite({
      workspaceId: id,
      userId: user.id,
      siteId,
      note: data.note,
      preview: data.preview,
      request,
    });

    // A failed deployment is a 200 with a failure body, not a 5xx: nothing
    // went wrong with the request, and the previous site is still live. The
    // client renders the message and offers a retry.
    return json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
