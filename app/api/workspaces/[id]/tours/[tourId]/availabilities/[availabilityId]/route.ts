import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateAvailabilitySchema } from "@/lib/validation";
import { requireAvailability, requireTour } from "@/lib/tours/service";

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

    const availability = await prisma.availability.update({
      where: { id: existing.id },
      data: {
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.priceOverride !== undefined ? { priceOverride: data.priceOverride } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
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
