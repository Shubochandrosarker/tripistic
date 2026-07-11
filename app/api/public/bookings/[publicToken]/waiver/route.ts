import { prisma } from "@/lib/db";
import { badRequest, handleApiError, noStoreJson, notFound } from "@/lib/api";
import { getRequestContext } from "@/lib/audit/audit-log";
import { signWaiverSchema } from "@/lib/validation";
import { getCurrentWaiverVersion, getWaiverStatusForBooking, signWaiver } from "@/lib/waivers/service";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ publicToken: string }> };

async function requireBooking(publicToken: string) {
  if (!publicToken || publicToken.length < 16) throw notFound("Not found");
  const booking = await prisma.booking.findUnique({
    where: { publicToken },
    include: { tour: { select: { waiverRequired: true } } },
  });
  if (!booking) throw notFound("Not found");
  if (!booking.tour.waiverRequired) throw badRequest("This tour does not require a signed waiver.");
  return booking;
}

/** The current waiver text + each participant's signed status — scoped by possession of the booking's publicToken, same trust model as the rest of the public booking API. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    const booking = await requireBooking(publicToken);

    const [version, status] = await Promise.all([
      getCurrentWaiverVersion(booking.workspaceId),
      getWaiverStatusForBooking(booking.workspaceId, booking.id),
    ]);

    return noStoreJson({
      waiver: version ? { title: version.title, bodyText: version.bodyText, versionNumber: version.versionNumber } : null,
      participants: status,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Records a signature for one participant on this booking. Idempotent — signing again returns the existing record. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { publicToken } = await params;
    const booking = await requireBooking(publicToken);

    const body = await request.json().catch(() => null);
    const data = signWaiverSchema.parse(body);
    const { ipAddress, userAgent } = await getRequestContext(request);

    const result = await signWaiver({
      workspaceId: booking.workspaceId,
      bookingId: booking.id,
      participantId: data.participantId,
      signerName: data.signerName,
      signatureImage: data.signatureImage,
      ipAddress,
      userAgent,
    });

    return noStoreJson({ signed: true, alreadySigned: result.alreadySigned }, result.alreadySigned ? 200 : 201);
  } catch (error) {
    return handleApiError(error);
  }
}
