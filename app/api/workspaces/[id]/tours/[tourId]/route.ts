import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateTourSchema, type UpdateTourInput } from "@/lib/validation";
import { requireTour } from "@/lib/tours/service";
import { archiveTour } from "@/lib/tours/archive";
import { assertCanActivateTour } from "@/lib/plans/entitlements";

type Params = { params: Promise<{ id: string; tourId: string }> };

/** Maps validated PATCH fields onto a Prisma update payload, status excluded
 * (status → archived is handled exclusively by the canonical archive service). */
function nonArchiveUpdateData(data: UpdateTourInput): Prisma.TourUpdateInput {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.kind !== undefined ? { kind: data.kind } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
    ...(data.durationDays !== undefined ? { durationDays: data.durationDays } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.meetingPoint !== undefined ? { meetingPoint: data.meetingPoint } : {}),
    ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
    ...(data.basePrice !== undefined ? { basePrice: data.basePrice } : {}),
    ...(data.currency !== undefined ? { currency: data.currency } : {}),
    ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    // A non-archive status change (e.g. draft -> active, or archived -> active
    // to reactivate) is a plain field update; only the *transition into*
    // archived goes through the canonical service.
    ...(data.status !== undefined && data.status !== "archived" ? { status: data.status } : {}),
    ...(data.cancellationPolicy !== undefined
      ? { cancellationPolicy: data.cancellationPolicy }
      : {}),
    ...(data.cancellationNoticeHours !== undefined
      ? { cancellationNoticeHours: data.cancellationNoticeHours }
      : {}),
    ...(data.waiverRequired !== undefined ? { waiverRequired: data.waiverRequired } : {}),
    ...(data.coverImageUrl !== undefined ? { coverImageUrl: data.coverImageUrl } : {}),
  };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);
    const tour = await requireTour(id, tourId);

    const [addons, schedules, upcoming] = await Promise.all([
      prisma.tourAddon.findMany({ where: { tourId, workspaceId: id }, orderBy: { createdAt: "asc" } }),
      prisma.tourSchedule.findMany({ where: { tourId, workspaceId: id }, orderBy: { createdAt: "asc" } }),
      prisma.availability.count({
        where: { tourId, workspaceId: id, status: "scheduled", startsAt: { gt: new Date() } },
      }),
    ]);

    return json({ tour, addons, schedules, upcomingSlots: upcoming });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    const existing = await requireTour(id, tourId);

    const body = await request.json().catch(() => null);
    const data = updateTourSchema.parse(body);

    const becameArchived = data.status === "archived" && existing.status !== "archived";
    const becomesActive = data.status === "active" && existing.status !== "active";
    if (becomesActive) {
      await assertCanActivateTour(id);
    }

    let tour;
    let cancelledSlots: number | undefined;
    if (becameArchived) {
      const result = await archiveTour({ workspaceId: id, tourId: existing.id, softDelete: false });
      tour = result.tour;
      cancelledSlots = result.cancelledSlots;
      const rest = nonArchiveUpdateData(data);
      if (Object.keys(rest).length > 0) {
        tour = await prisma.tour.update({ where: { id: tour.id }, data: rest });
      }
    } else {
      tour = await prisma.tour.update({
        where: { id: existing.id },
        data: nonArchiveUpdateData(data),
      });
    }

    await recordAuditEvent({
      action: becameArchived ? "tour_archived" : "tour_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "tour",
      entityId: tour.id,
      metadata: {
        fields: Object.keys(data).join(","),
        ...(cancelledSlots !== undefined ? { cancelledSlots } : {}),
      },
      request,
    });

    return json({ tour });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Soft-delete a tour and cancel its future departures (canonical archive service). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    const existing = await requireTour(id, tourId);

    const { tour, cancelledSlots } = await archiveTour({
      workspaceId: id,
      tourId: existing.id,
      softDelete: true,
    });

    await recordAuditEvent({
      action: "tour_archived",
      workspaceId: id,
      userId: user.id,
      entityType: "tour",
      entityId: tour.id,
      metadata: { title: tour.title, softDeleted: true, cancelledSlots },
      request,
    });

    return json({ ok: true, cancelledSlots });
  } catch (error) {
    return handleApiError(error);
  }
}
