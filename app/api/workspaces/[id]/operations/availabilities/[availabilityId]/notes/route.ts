import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageOperations } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createOpsNoteSchema } from "@/lib/validation";
import { addOpsNote } from "@/lib/operations/service";

type Params = { params: Promise<{ id: string; availabilityId: string }> };

/** Internal note on a departure's ops timeline — dispatch coordination, not visible to guests. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageOperations(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can add notes.");
    }

    const body = await request.json().catch(() => null);
    const data = createOpsNoteSchema.parse(body);
    const event = await addOpsNote(id, availabilityId, data.message, user.id);

    await recordAuditEvent({
      action: "ops_note_added",
      workspaceId: id,
      userId: user.id,
      entityType: "ops_event",
      entityId: event.id,
      metadata: { availabilityId },
      request,
    });

    return json({ event }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
