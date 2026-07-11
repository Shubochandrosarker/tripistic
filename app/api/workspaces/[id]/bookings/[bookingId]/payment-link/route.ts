import { prisma } from "@/lib/db";
import { conflict, forbidden, handleApiError, json, notFound } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageBookings } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { buildBookingCancelUrl, buildBookingSuccessUrl, checkoutUrlFromPayment, ensureCheckoutSessionForBooking } from "@/lib/payments/service";
import { serializePaymentDetail } from "@/lib/payments/serializers";

type Params = { params: Promise<{ id: string; bookingId: string }> };

/**
 * Lets an operator generate a real Stripe payment link for a manual (phone
 * or walk-in) booking that was created `pending` without collecting money
 * up front — reuses the same Checkout Session machinery as the public
 * flow, never a separate "fake capture" path.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, bookingId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageBookings(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can generate a payment link.");
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, workspaceId: id },
      include: { participants: true, addonSelections: true },
    });
    if (!booking) throw notFound("Booking not found");
    if (booking.status !== "pending") {
      throw conflict("Only a pending booking can have a payment link generated.");
    }
    if (booking.totalAmount <= 0) {
      throw conflict("This booking has nothing to charge.");
    }

    const payment = await ensureCheckoutSessionForBooking(booking, {
      successUrl: buildBookingSuccessUrl(booking.publicToken),
      cancelUrl: buildBookingCancelUrl(booking.publicToken),
    });

    await recordAuditEvent({
      action: "payment_created",
      workspaceId: id,
      userId: user.id,
      entityType: "booking",
      entityId: bookingId,
      metadata: { reference: booking.reference, paymentId: payment.id },
      request,
    });

    return json({
      payment: serializePaymentDetail({ ...payment, events: [] }, membership.role),
      checkoutUrl: checkoutUrlFromPayment(payment),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
