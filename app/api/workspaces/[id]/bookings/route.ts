import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageBookings, canViewBookings } from "@/lib/auth/permissions";
import { manualBookingRequestSchema, bookingListQuerySchema } from "@/lib/validation";
import { createBooking } from "@/lib/bookings/service";
import { buildBookingListQuery } from "@/lib/bookings/query";
import { serializeBookingDetail, serializeBookingListItem } from "@/lib/bookings/serializers";

type Params = { params: Promise<{ id: string }> };

/** Paginated, filtered booking list. Owner/admin/staff full PII; viewer redacted. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewBookings(membership.role)) {
      throw forbidden("You do not have permission to view bookings.");
    }

    const url = new URL(request.url);
    const query = bookingListQuerySchema.parse(Object.fromEntries(url.searchParams));
    const { where, orderBy, skip, take } = buildBookingListQuery(id, query);

    const [bookings, total, summary] = await Promise.all([
      prisma.booking.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { participants: true, addonSelections: true },
      }),
      prisma.booking.count({ where }),
      prisma.booking.groupBy({
        by: ["status"],
        where: { workspaceId: id },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
    ]);

    const summaryByStatus = Object.fromEntries(
      summary.map((row) => [row.status, { count: row._count._all, bookedValue: row._sum.totalAmount ?? 0 }]),
    );

    return json({
      bookings: bookings.map((b) => serializeBookingListItem(b, membership.role)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      summary: {
        total: Object.values(summaryByStatus).reduce((sum: number, s) => sum + (s as { count: number }).count, 0),
        byStatus: summaryByStatus,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Manual (operator-created) booking — routes through the same canonical service as public bookings. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageBookings(membership.role)) {
      throw forbidden("Only workspace owners, admins, and staff can create bookings.");
    }

    const body = await request.json().catch(() => null);
    const data = manualBookingRequestSchema.parse(body);

    const { booking } = await createBooking({
      workspaceId: id,
      tourId: data.tourId,
      availabilityId: data.availabilityId,
      participantCount: data.participantCount,
      participants: data.participants,
      guestFirstName: data.guestFirstName,
      guestLastName: data.guestLastName,
      guestEmail: data.guestEmail,
      guestPhone: data.guestPhone,
      guestNotes: data.guestNotes,
      addons: data.addons,
      source: "manual",
      requirePublicVisibility: false,
      status: data.status,
      createdById: user.id,
      operatorNotes: data.operatorNotes,
    });

    return json({ booking: serializeBookingDetail(booking, membership.role) }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
