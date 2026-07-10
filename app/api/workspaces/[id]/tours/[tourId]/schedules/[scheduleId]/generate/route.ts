import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { generateSlotsSchema } from "@/lib/validation";
import { requireSchedule, requireTour } from "@/lib/tours/service";
import { generateSlotsForSchedule } from "@/lib/tours/schedule";

type Params = { params: Promise<{ id: string; tourId: string; scheduleId: string }> };

/** Materialize upcoming departures for a schedule. Idempotent (skips existing). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id, tourId, scheduleId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    const tour = await requireTour(id, tourId);
    const schedule = await requireSchedule(id, tourId, scheduleId);

    const body = await request.json().catch(() => ({}));
    const data = generateSlotsSchema.parse(body ?? {});

    const created = await generateSlotsForSchedule({
      tour,
      schedule,
      timezone: membership.workspace.timezone,
      days: data.days,
    });

    await recordAuditEvent({
      action: "availability_generated",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_schedule",
      entityId: schedule.id,
      metadata: { tourId, days: data.days, created },
      request,
    });

    return json({ created, days: data.days });
  } catch (error) {
    return handleApiError(error);
  }
}
