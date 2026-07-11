import { prisma } from "@/lib/db";
import { handleApiError, notFound, noStoreJson } from "@/lib/api";
import { serializePublicBookingConfirmation } from "@/lib/bookings/serializers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ publicToken: string }> };

/**
 * Public confirmation retrieval — resolved only by the high-entropy token,
 * never a sequential booking ID. Returns this booking's own safe summary
 * only; no other bookings, operator notes, or internal identifiers.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    if (!publicToken || publicToken.length < 16) throw notFound("Not found");

    const booking = await prisma.booking.findUnique({
      where: { publicToken },
      include: { participants: true, addonSelections: true },
    });
    if (!booking) throw notFound("Not found");

    return noStoreJson({ booking: serializePublicBookingConfirmation(booking) });
  } catch (error) {
    return handleApiError(error);
  }
}
