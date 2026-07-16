import { prisma } from "@/lib/db";
import { badRequest, conflict, forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateAvailabilitySchema } from "@/lib/validation";
import { requireAvailability, requireTour } from "@/lib/tours/service";
import { requireAssignableMember } from "@/lib/guides/service";
import { requireActiveVehicle } from "@/lib/vehicles/service";

type Params = { params: Promise<{ id: string; tourId: string; availabilityId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, tourId, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    await requireTour(id, tourId);
    const existing = await requireAvailability(id, tourId, availabilityId);

    const body = await request.json().catch(() => null);
    const data = updateAvailabilitySchema.parse(body);

    if (data.capacity !== undefined && data.capacity < existing.bookedCount) {
      throw badRequest(
        `Capacity cannot be less than the ${existing.bookedCount} seat${existing.bookedCount === 1 ? "" : "s"} already booked. Minimum allowed capacity is ${existing.bookedCount}.`,
      );
    }
    if (data.guideId !== undefined && data.guideId !== null) {
      await requireAssignableMember(id, data.guideId);
    }
    if (data.driverId !== undefined && data.driverId !== null) {
      await requireAssignableMember(id, data.driverId);
    }
    if (data.vehicleId !== undefined && data.vehicleId !== null) {
      await requireActiveVehicle(id, data.vehicleId);
    }

    const availability = await prisma.availability.update({
      where: { id: existing.id },
      data: {
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.priceOverride !== undefined ? { priceOverride: data.priceOverride } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.guideId !== undefined ? { guideId: data.guideId } : {}),
        ...(data.driverId !== undefined ? { driverId: data.driverId } : {}),
        ...(data.vehicleId !== undefined ? { vehicleId: data.vehicleId } : {}),
      },
    });

    await recordAuditEvent({
      action: "availability_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "availability",
      entityId: availability.id,
      metadata: { tourId, fields: Object.keys(data).join(",") },
      request,
    });

    return json({ availability });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Cancel a departure (row is kept for history; never hard-deleted). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, tourId, availabilityId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    await requireTour(id, tourId);
    const existing = await requireAvailability(id, tourId, availabilityId);

    const activeBookings = await prisma.booking.count({
      where: { availabilityId: existing.id, status: { in: ["pending", "confirmed"] } },
    });
    if (activeBookings > 0) {
      throw conflict(
        `This departure has ${activeBookings} active booking${activeBookings === 1 ? "" : "s"}. ` +
          "Cancel or complete those bookings before cancelling the departure.",
      );
    }

    const availability = await prisma.availability.update({
      where: { id: existing.id },
      data: { status: "cancelled" },
    });

    await recordAuditEvent({
      action: "availability_cancelled",
      workspaceId: id,
      userId: user.id,
      entityType: "availability",
      entityId: availability.id,
      metadata: { tourId, startsAt: availability.startsAt.toISOString() },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
