import { z } from "zod";

import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";
import { setUserStatus } from "@/lib/admin/platform-actions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ status: z.enum(["active", "suspended"]) });

/** Suspend or reactivate a user account across every workspace they belong to. */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requirePlatformAdminApi();
    const { userId } = await params;
    const { status } = bodySchema.parse(await request.json().catch(() => null));

    const result = await setUserStatus(userId, status, { actorId: admin.id, request });
    return json({ ok: true, user: result.user, changed: result.changed });
  } catch (error) {
    return handleApiError(error);
  }
}
