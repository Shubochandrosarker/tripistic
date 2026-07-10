import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createBlackoutSchema } from "@/lib/validation";
import { requireTour } from "@/lib/tours/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);

    const blackoutDates = await prisma.blackoutDate.findMany({
      where: { workspaceId: id },
      orderBy: { startsOn: "asc" },
      include: { tour: { select: { id: true, title: true } } },
    });
    return json({ blackoutDates });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create a blackout range (workspace-wide, or tour-specific when tourId given). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage availability.");
    }

    const body = await request.json().catch(() => null);
    const data = createBlackoutSchema.parse(body);

    // A client-supplied tourId must belong to this workspace.
    if (data.tourId) await requireTour(id, data.tourId);

    const blackout = await prisma.blackoutDate.create({
      data: {
        workspaceId: id,
        tourId: data.tourId ?? null,
        startsOn: new Date(`${data.startsOn}T00:00:00.000Z`),
        endsOn: new Date(`${data.endsOn ?? data.startsOn}T00:00:00.000Z`),
        reason: data.reason ?? null,
      },
    });

    await recordAuditEvent({
      action: "blackout_created",
      workspaceId: id,
      userId: user.id,
      entityType: "blackout_date",
      entityId: blackout.id,
      metadata: {
        startsOn: data.startsOn,
        endsOn: data.endsOn ?? data.startsOn,
        tourId: data.tourId ?? null,
      },
      request,
    });

    return json({ blackout }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
