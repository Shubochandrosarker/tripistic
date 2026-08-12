import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

import { gateX402Route } from "@/lib/x402/middleware";

/**
 * Machine-readable tour search, behind x402.
 *
 * Priced because it is a bulk data endpoint for autonomous agents, not because
 * the data is private: everything it returns is already visible on a public
 * storefront. What the price buys is the structured, paginated, no-scraping
 * version of it, and the rate ceiling that comes with a grant.
 *
 * Deliberately the same underlying query as the public marketplace search — one
 * definition of "a publicly listed tour", so a tour hidden from the storefront
 * cannot appear here.
 */

const searchSchema = z.object({
  query: z.string().trim().max(160).optional(),
  location: z.string().trim().max(120).optional(),
  maxPriceCents: z.number().int().min(0).max(10_000_000).optional(),
  maxDurationMinutes: z.number().int().min(1).max(20_160).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export async function POST(request: Request) {
  try {
    const gate = await gateX402Route(request);
    if (!gate.allowed) return gate.response;

    const input = searchSchema.parse((await request.json().catch(() => null)) ?? {});

    const tours = await prisma.tour.findMany({
      where: {
        status: "active",
        visibility: "public",
        deletedAt: null,
        workspace: { status: "active", deletedAt: null },
        ...(input.maxPriceCents !== undefined ? { basePrice: { lte: input.maxPriceCents } } : {}),
        ...(input.maxDurationMinutes !== undefined
          ? { durationMinutes: { lte: input.maxDurationMinutes } }
          : {}),
        ...(input.location
          ? { location: { contains: input.location, mode: "insensitive" as const } }
          : {}),
        ...(input.query
          ? {
              OR: [
                { title: { contains: input.query, mode: "insensitive" as const } },
                { description: { contains: input.query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      take: input.limit,
      orderBy: { updatedAt: "desc" },
      // Slugs, never internal ids — the same rule the published site Workers
      // follow. An id in an external response is an id someone will try to use.
      select: {
        title: true,
        slug: true,
        location: true,
        durationMinutes: true,
        basePrice: true,
        currency: true,
        capacity: true,
        workspace: { select: { name: true, slug: true } },
      },
    });

    return Response.json(
      {
        tours: tours.map((tour) => ({
          title: tour.title,
          location: tour.location,
          durationMinutes: tour.durationMinutes,
          priceCents: tour.basePrice,
          currency: tour.currency,
          capacity: tour.capacity,
          operator: tour.workspace.name,
          url: `/book/${tour.workspace.slug}/${tour.slug}`,
        })),
        count: tours.length,
        // Availability is deliberately absent. It changes by the minute and a
        // number cached in a search result is a number that oversells a
        // departure; the booking endpoint is the only source for it.
        note: "Availability and final pricing must be confirmed through the booking endpoint.",
      },
      { headers: { "Cache-Control": "no-store", "X-Payment-Remaining": String(gate.remaining) } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
