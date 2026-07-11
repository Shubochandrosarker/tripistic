import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageBookings } from "@/lib/auth/permissions";
import { bookingStatusTransitionSchema } from "@/lib/validation";
import { transitionBookingStatus } from "@/lib/bookings/status-service";
import { serializeBookingDetail } from "@/lib/bookings/serializers";
import { serializePaymentDetail, serializePaymentSummary } from "@/lib/payments/serializers";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string; bookingId: string }> };

/** Centralized status-machine transition (confirm/cancel/complete/no-show). Rejects invalid transitions with 409. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageBookings(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can change booking status.");
    }

    const body = await request.json().catch(() => null);
    const data = bookingStatusTransitionSchema.parse(body);

    await transitionBookingStatus({
      workspaceId: id,
      bookingId,
      toStatus: data.status,
      actor: { kind: "user", userId: user.id },
      note: data.note,
    });

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        participants: true,
        addonSelections: true,
        statusEvents: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
        payments: { orderBy: { createdAt: "desc" }, take: 1, include: { events: { orderBy: { createdAt: "asc" } } } },
      },
    });
    const payment = booking.payments[0] ?? null;

    return json({
      booking: serializeBookingDetail(booking, membership.role),
      payment: serializePaymentSummary(payment),
      paymentDetail: serializePaymentDetail(payment, membership.role),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
