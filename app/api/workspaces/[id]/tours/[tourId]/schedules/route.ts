import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createScheduleSchema } from "@/lib/validation";
import { requireTour } from "@/lib/tours/service";
import { generateSlotsForSchedule } from "@/lib/tours/schedule";
import { SLOT_GENERATION_DEFAULT_DAYS } from "@/lib/constants";

type Params = { params: Promise<{ id: string; tourId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);
    await requireTour(id, tourId);

    const schedules = await prisma.tourSchedule.findMany({
      where: { tourId, workspaceId: id },
      orderBy: { createdAt: "asc" },
    });
    return json({ schedules });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create a recurring schedule and materialize its first window of slots. */
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
    const data = createScheduleSchema.parse(body);

    const schedule = await prisma.tourSchedule.create({
      data: {
        workspaceId: id,
        tourId: tour.id,
        name: data.name ?? null,
        daysOfWeek: data.daysOfWeek,
        startTime: data.startTime,
        durationMinutes: data.durationMinutes ?? null,
        capacity: data.capacity ?? null,
        startsOn: new Date(`${data.startsOn}T00:00:00.000Z`),
        endsOn: data.endsOn ? new Date(`${data.endsOn}T00:00:00.000Z`) : null,
      },
    });

    const created = await generateSlotsForSchedule({
      tour,
      schedule,
      timezone: membership.workspace.timezone,
      days: SLOT_GENERATION_DEFAULT_DAYS,
    });

    await recordAuditEvent({
      action: "schedule_created",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_schedule",
      entityId: schedule.id,
      metadata: { tourId: tour.id, startTime: data.startTime, generatedSlots: created },
      request,
    });

    return json({ schedule, generatedSlots: created }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
