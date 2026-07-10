import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { addonSchema } from "@/lib/validation";
import { requireTour } from "@/lib/tours/service";

type Params = { params: Promise<{ id: string; tourId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id, tourId } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);
    await requireTour(id, tourId);

    const addons = await prisma.tourAddon.findMany({
      where: { tourId, workspaceId: id },
      orderBy: { createdAt: "asc" },
    });
    return json({ addons });
  } catch (error) {
    return handleApiError(error);
  }
}

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
    const data = addonSchema.parse(body);

    const addon = await prisma.tourAddon.create({
      data: {
        workspaceId: id,
        tourId: tour.id,
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        maxPerBooking: data.maxPerBooking ?? null,
        isActive: data.isActive ?? true,
      },
    });

    await recordAuditEvent({
      action: "addon_created",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_addon",
      entityId: addon.id,
      metadata: { tourId: tour.id, name: addon.name },
      request,
    });

    return json({ addon }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
