import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canViewOperations } from "@/lib/auth/permissions";
import { opsBoardQuerySchema } from "@/lib/validation";
import { listDeparturesForDate, dayBoundsInTz } from "@/lib/operations/service";
import { hasActiveEmergency } from "@/lib/dispatch/service";

type Params = { params: Promise<{ id: string }> };

/** Today's (or a chosen date's) departures with live ops status — the Operations Center board. */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canViewOperations(membership.role)) {
      throw forbidden("You do not have permission to view operations.");
    }

    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id }, select: { timezone: true } });

    const url = new URL(request.url);
    const query = opsBoardQuerySchema.parse({ date: url.searchParams.get("date") || undefined });
    const dateKey = query.date ?? new Date().toISOString().slice(0, 10);
    const { dayStart, dayEnd } = dayBoundsInTz(dateKey, workspace.timezone);

    const [departures, emergency] = await Promise.all([
      listDeparturesForDate(id, dayStart, dayEnd),
      hasActiveEmergency(id),
    ]);

    return json({
      date: dateKey,
      emergency,
      departures: departures.map((d) => ({
        id: d.id,
        startsAt: d.startsAt.toISOString(),
        endsAt: d.endsAt.toISOString(),
        opsStatus: d.opsStatus,
        delayMinutes: d.delayMinutes,
        capacity: d.capacity,
        bookedCount: d.bookedCount,
        checkedInCount: d.bookings.length,
        tour: d.tour,
        guide: d.guide ? { id: d.guide.id, name: d.guide.user.name } : null,
        driver: d.driver ? { id: d.driver.id, name: d.driver.user.name } : null,
        vehicle: d.vehicle ? { id: d.vehicle.id, name: d.vehicle.name } : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
