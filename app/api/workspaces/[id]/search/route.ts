import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { canViewBookings, canViewCustomers, canViewItineraries, canManageTours } from "@/lib/auth/permissions";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    if (q.length < 2) return json({ results: [] });

    const [bookings, customers, tours, itineraries] = await Promise.all([
      canViewBookings(membership.role)
        ? prisma.booking.findMany({
            where: {
              workspaceId: id,
              OR: [
                { reference: { contains: q, mode: "insensitive" } },
                { guestFirstName: { contains: q, mode: "insensitive" } },
                { guestLastName: { contains: q, mode: "insensitive" } },
                { guestEmail: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, reference: true, guestFirstName: true, guestLastName: true, departureStartsAt: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : [],
      canViewCustomers(membership.role)
        ? prisma.customer.findMany({
            where: {
              workspaceId: id,
              deletedAt: null,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, name: true, email: true },
            orderBy: { updatedAt: "desc" },
            take: 5,
          })
        : [],
      canManageTours(membership.role)
        ? prisma.tour.findMany({
            where: {
              workspaceId: id,
              deletedAt: null,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, title: true, status: true, visibility: true },
            orderBy: { updatedAt: "desc" },
            take: 5,
          })
        : [],
      canViewItineraries(membership.role)
        ? prisma.itinerary.findMany({
            where: {
              workspaceId: id,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { destination: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { id: true, title: true, destination: true, status: true },
            orderBy: { updatedAt: "desc" },
            take: 5,
          })
        : [],
    ]);

    if (
      bookings.length === 0 &&
      customers.length === 0 &&
      tours.length === 0 &&
      itineraries.length === 0 &&
      !canViewBookings(membership.role) &&
      !canViewCustomers(membership.role) &&
      !canManageTours(membership.role) &&
      !canViewItineraries(membership.role)
    ) {
      throw forbidden();
    }

    return json({
      results: [
        ...bookings.map((booking) => ({
          id: `booking-${booking.id}`,
          type: "booking" as const,
          label: `${booking.reference} · ${booking.guestFirstName} ${booking.guestLastName}`,
          description: `Departure ${booking.departureStartsAt.toISOString().slice(0, 10)}`,
          href: `/dashboard/bookings/${booking.id}`,
        })),
        ...customers.map((customer) => ({
          id: `customer-${customer.id}`,
          type: "customer" as const,
          label: customer.name,
          description: customer.email,
          href: `/dashboard/customers/${customer.id}`,
        })),
        ...tours.map((tour) => ({
          id: `tour-${tour.id}`,
          type: "tour" as const,
          label: tour.title,
          description: `${tour.status} · ${tour.visibility}`,
          href: `/dashboard/tours/${tour.id}`,
        })),
        ...itineraries.map((itinerary) => ({
          id: `itinerary-${itinerary.id}`,
          type: "itinerary" as const,
          label: itinerary.title,
          description: itinerary.destination ?? itinerary.status,
          href: `/dashboard/itineraries/${itinerary.id}`,
        })),
      ].slice(0, 12),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
