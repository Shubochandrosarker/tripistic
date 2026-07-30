import { z } from "zod";

import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { setPlatformAdmin } from "@/lib/admin/platform-actions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ isPlatformAdmin: z.boolean() });

/** Grant or revoke platform-admin access. Refuses self-revocation and the last admin. */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requirePlatformAdminApi();
    const { userId } = await params;
    const { isPlatformAdmin } = bodySchema.parse(await request.json().catch(() => null));

    const result = await setPlatformAdmin(userId, isPlatformAdmin, { actorId: admin.id, request });
    return json({ ok: true, user: result.user, changed: result.changed });
  } catch (error) {
    return handleApiError(error);
  }
}
