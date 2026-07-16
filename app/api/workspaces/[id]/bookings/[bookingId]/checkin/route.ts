import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageOperations } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { checkInBooking } from "@/lib/operations/service";

type Params = { params: Promise<{ id: string; bookingId: string }> };

/** Marks a confirmed guest as checked in at departure — Operations Center check-in board. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageOperations(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can check guests in.");
    }

    const booking = await checkInBooking(id, bookingId, user.id);

    await recordAuditEvent({
      action: "booking_checked_in",
      workspaceId: id,
      userId: user.id,
      entityType: "booking",
      entityId: booking.id,
      metadata: { reference: booking.reference },
      request,
    });

    return json({ booking });
  } catch (error) {
    return handleApiError(error);
  }
}
