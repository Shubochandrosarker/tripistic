import { prisma } from "@/lib/db";
import { badRequest, handleApiError, notFound, noStoreJson } from "@/lib/api";
import { requirePublicWorkspace } from "@/lib/tenancy/public";
import { publicBookingRequestSchema } from "@/lib/validation";
import { createBooking } from "@/lib/bookings/service";
import { serializePublicBookingConfirmation } from "@/lib/bookings/serializers";
import { buildBookingCancelUrl, buildBookingSuccessUrl, ensureCheckoutSessionForBooking } from "@/lib/payments/service";
import { serializePublicPayment } from "@/lib/payments/serializers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string }> };

const MAX_BODY_BYTES = 50_000;

/** Public direct booking creation — the only write path for anonymous guests, backed by the canonical booking service. */
export async function POST(request: Request, { params }: Params) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      throw badRequest("Request body is too large.");
    }

    const { workspaceSlug } = await params;
    const workspace = await requirePublicWorkspace(workspaceSlug);

    const body = await request.json().catch(() => null);
    const data = publicBookingRequestSchema.parse(body);

    // Hidden honeypot field: a real browser never fills it in. Reject
    // generically — do not reveal that a bot check exists or was tripped.
    if (data.website && data.website.trim() !== "") {
      throw badRequest("Invalid request");
    }

    const availabilityRef = await prisma.availability.findFirst({
      where: { id: data.availabilityId, workspaceId: workspace.id },
      select: { tourId: true, tour: { select: { slug: true } } },
    });
    if (!availabilityRef) throw notFound("This departure is not available for booking.");

    const { booking, idempotentReplay } = await createBooking({
      workspaceId: workspace.id,
      tourId: availabilityRef.tourId,
      availabilityId: data.availabilityId,
      participantCount: data.participantCount,
      participants: data.participants,
      guestFirstName: data.guestFirstName,
      guestLastName: data.guestLastName,
      guestEmail: data.guestEmail,
      guestPhone: data.guestPhone,
      guestNotes: data.guestNotes,
      addons: data.addons,
      idempotencyKey: data.idempotencyKey,
      source: "public_direct",
      requirePublicVisibility: true,
    });

    // Phase 4: a paid booking lands `pending` (see lib/bookings/service.ts) —
    // create (or, on an idempotent replay, reuse) its Stripe Checkout
    // Session so the client can redirect the guest to pay. A free booking
    // is already `confirmed` and has nothing to charge.
    const payment =
      booking.status === "pending" && booking.totalAmount > 0
        ? await ensureCheckoutSessionForBooking(booking, {
            successUrl: buildBookingSuccessUrl(booking.publicToken),
            cancelUrl: buildBookingCancelUrl(booking.publicToken, workspaceSlug, availabilityRef.tour.slug),
          })
        : null;

    return noStoreJson(
      { booking: serializePublicBookingConfirmation(booking), payment: serializePublicPayment(payment) },
      idempotentReplay ? 200 : 201,
    );
  } catch (error) {
    return handleApiError(error);
  }
}
