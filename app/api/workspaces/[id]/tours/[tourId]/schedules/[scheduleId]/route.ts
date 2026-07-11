import { prisma } from "@/lib/db";
import { badRequest, forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateScheduleSchema } from "@/lib/validation";
import { requireSchedule, requireTour } from "@/lib/tours/service";
import { dateKey } from "@/lib/tours/schedule";

type Params = { params: Promise<{ id: string; tourId: string; scheduleId: string }> };

/** Editing a rule affects future generation only; existing slots stay as-is. */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, tourId, scheduleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    await requireTour(id, tourId);
    const existing = await requireSchedule(id, tourId, scheduleId);

    const body = await request.json().catch(() => null);
    const data = updateScheduleSchema.parse(body);

    // A patch may touch only one side of the date range — validate the
    // range that will actually be stored, not just the fields present in
    // this request, so `startsOn`-only or `endsOn`-only edits can't produce
    // an inverted range.
    const mergedStartsOn = data.startsOn ?? dateKey(existing.startsOn);
    const mergedEndsOn =
      data.endsOn !== undefined ? data.endsOn : existing.endsOn ? dateKey(existing.endsOn) : null;
    if (mergedEndsOn && mergedEndsOn < mergedStartsOn) {
      throw badRequest("End date must be on or after the start date");
    }

    const schedule = await prisma.tourSchedule.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.daysOfWeek !== undefined ? { daysOfWeek: data.daysOfWeek } : {}),
        ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
        ...(data.durationMinutes !== undefined ? { durationMinutes: data.durationMinutes } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.startsOn !== undefined
          ? { startsOn: new Date(`${data.startsOn}T00:00:00.000Z`) }
          : {}),
        ...(data.endsOn !== undefined
          ? { endsOn: data.endsOn ? new Date(`${data.endsOn}T00:00:00.000Z`) : null }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });

    await recordAuditEvent({
      action: "schedule_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_schedule",
      entityId: schedule.id,
      metadata: { tourId, fields: Object.keys(data).join(",") },
      request,
    });

    return json({ schedule });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Delete the rule. Already-generated slots are kept (schedule_id set null via FK). */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, tourId, scheduleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    await requireTour(id, tourId);
    const schedule = await requireSchedule(id, tourId, scheduleId);

    await prisma.tourSchedule.delete({ where: { id: schedule.id } });

    await recordAuditEvent({
      action: "schedule_deleted",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_schedule",
      entityId: schedule.id,
      metadata: { tourId },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
