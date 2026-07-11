import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageBookings, canViewBookings } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateBookingSchema } from "@/lib/validation";
import { serializeBookingDetail } from "@/lib/bookings/serializers";

type Params = { params: Promise<{ id: string; bookingId: string }> };

async function requireBooking(workspaceId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, workspaceId },
    include: {
      participants: true,
      addonSelections: true,
      statusEvents: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!booking) throw notFound("Booking not found");
  return booking;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewBookings(membership.role)) {
      throw forbidden("You do not have permission to view bookings.");
    }
    const booking = await requireBooking(id, bookingId);
    return json({ booking: serializeBookingDetail(booking, membership.role) });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Limited, non-financial edit only — departure, party size, price, and add-ons are not editable here. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageBookings(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can edit bookings.");
    }
    await requireBooking(id, bookingId);

    const body = await request.json().catch(() => null);
    const data = updateBookingSchema.parse(body);

    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        ...(data.guestFirstName !== undefined ? { guestFirstName: data.guestFirstName } : {}),
        ...(data.guestLastName !== undefined ? { guestLastName: data.guestLastName } : {}),
        ...(data.guestEmail !== undefined ? { guestEmail: data.guestEmail.trim().toLowerCase() } : {}),
        ...(data.guestPhone !== undefined ? { guestPhone: data.guestPhone } : {}),
        ...(data.guestNotes !== undefined ? { guestNotes: data.guestNotes } : {}),
        ...(data.operatorNotes !== undefined ? { operatorNotes: data.operatorNotes } : {}),
      },
      include: { participants: true, addonSelections: true, statusEvents: { orderBy: { createdAt: "asc" } } },
    });

    await recordAuditEvent({
      action: "booking_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "booking",
      entityId: bookingId,
      metadata: { reference: updated.reference, fields: Object.keys(data).join(",") },
      request,
    });

    return json({ booking: serializeBookingDetail(updated, membership.role) });
  } catch (error) {
    return handleApiError(error);
  }
}
