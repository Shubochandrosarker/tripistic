import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { bookingListQuerySchema } from "@/lib/validation";

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;

/**
 * Shared filter/sort builder used by both `GET /api/workspaces/:id/bookings`
 * and the `/dashboard/bookings` server component, so the two never drift.
 */
export function buildBookingListQuery(
  workspaceId: string,
  query: BookingListQuery,
): { where: Prisma.BookingWhereInput; orderBy: Prisma.BookingOrderByWithRelationInput; skip: number; take: number } {
  const where: Prisma.BookingWhereInput = { workspaceId };

  if (query.status) where.status = query.status;
  if (query.source) where.source = query.source;
  if (query.tourId) where.tourId = query.tourId;

  if (query.when === "upcoming") {
    where.departureStartsAt = { gt: new Date() };
  } else if (query.when === "past") {
    where.departureStartsAt = { lte: new Date() };
  }

  if (query.from || query.to) {
    where.departureStartsAt = {
      ...(typeof where.departureStartsAt === "object" ? where.departureStartsAt : {}),
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    };
  }

  if (query.search) {
    const search = query.search.trim();
    if (search.length > 0) {
      where.OR = [
        { reference: { contains: search, mode: "insensitive" } },
        { guestFirstName: { contains: search, mode: "insensitive" } },
        { guestLastName: { contains: search, mode: "insensitive" } },
        { guestEmail: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  const orderBy: Prisma.BookingOrderByWithRelationInput =
    query.sort === "createdAt_asc"
      ? { createdAt: "asc" }
      : query.sort === "departure_asc"
        ? { departureStartsAt: "asc" }
        : query.sort === "departure_desc"
          ? { departureStartsAt: "desc" }
          : { createdAt: "desc" };

  return {
    where,
    orderBy,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}
