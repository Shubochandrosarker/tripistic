import { prisma } from "@/lib/db";
import { conflict, handleApiError, notFound, noStoreJson } from "@/lib/api";
import { serializePublicPayment } from "@/lib/payments/serializers";
import { buildBookingCancelUrl, buildBookingSuccessUrl, ensureCheckoutSessionForBooking } from "@/lib/payments/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ publicToken: string }> };

/**
 * Lets a guest whose payment failed or whose Checkout Session expired try
 * again without losing their reserved seats — `ensureCheckoutSessionForBooking`
 * reuses a still-open session if one exists, or opens a fresh one otherwise.
 * Rejected once the booking has left `pending` (already paid and confirmed,
 * or already cancelled/expired) — there is nothing left to pay for.
 */
export async function POST(_request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    if (!publicToken || publicToken.length < 16) throw notFound("Not found");

    const booking = await prisma.booking.findUnique({
      where: { publicToken },
      include: { participants: true, addonSelections: true },
    });
    if (!booking) throw notFound("Not found");

    if (booking.status !== "pending" || booking.totalAmount <= 0) {
      throw conflict("This booking is not awaiting payment.");
    }

    const [tour, workspace] = await Promise.all([
      prisma.tour.findFirst({ where: { id: booking.tourId, workspaceId: booking.workspaceId }, select: { slug: true } }),
      prisma.workspace.findUnique({ where: { id: booking.workspaceId }, select: { slug: true } }),
    ]);

    const payment = await ensureCheckoutSessionForBooking(booking, {
      successUrl: buildBookingSuccessUrl(booking.publicToken),
      cancelUrl: buildBookingCancelUrl(booking.publicToken, workspace?.slug, tour?.slug),
    });

    return noStoreJson({ payment: serializePublicPayment(payment) });
  } catch (error) {
    return handleApiError(error);
  }
}
