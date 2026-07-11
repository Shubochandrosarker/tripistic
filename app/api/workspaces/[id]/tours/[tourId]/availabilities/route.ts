import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { conflict, forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { availabilityQuerySchema, createAvailabilitySchema } from "@/lib/validation";
import { requireTour } from "@/lib/tours/service";
import { requireAssignableMember } from "@/lib/guides/service";

type Params = { params: Promise<{ id: string; tourId: string }> };

/** Departure slots for a tour. ?from&to ISO filters (validated, 400 on bad input); defaults to upcoming. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);
    await requireTour(id, tourId);

    const url = new URL(request.url);
    const query = availabilityQuerySchema.parse({
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    const limitParam = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 100;

    const from = query.from ?? new Date();

    const availabilities = await prisma.availability.findMany({
      where: {
        tourId,
        workspaceId: id,
        startsAt: { gte: from, ...(query.to ? { lte: query.to } : {}) },
      },
      orderBy: { startsAt: "asc" },
      take: limit,
    });

    return json({ availabilities });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create a one-off departure slot. */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    const tour = await requireTour(id, tourId);

    const body = await request.json().catch(() => null);
    const data = createAvailabilitySchema.parse(body);

    if (data.guideId) {
      await requireAssignableMember(id, data.guideId);
    }

    const durationMs = (data.durationMinutes ?? tour.durationMinutes) * 60_000;

    try {
      const availability = await prisma.availability.create({
        data: {
          workspaceId: id,
          tourId: tour.id,
          startsAt: data.startsAt,
          endsAt: new Date(data.startsAt.getTime() + durationMs),
          capacity: data.capacity ?? tour.capacity,
          priceOverride: data.priceOverride ?? null,
          notes: data.notes ?? null,
          guideId: data.guideId ?? null,
        },
      });

      await recordAuditEvent({
        action: "availability_created",
        workspaceId: id,
        userId: user.id,
        entityType: "availability",
        entityId: availability.id,
        metadata: { tourId: tour.id, startsAt: availability.startsAt.toISOString() },
        request,
      });

      return json({ availability }, 201);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("A departure already exists at that exact time for this tour.");
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
