import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { updateAddonSchema } from "@/lib/validation";
import { requireAddon, requireTour } from "@/lib/tours/service";

type Params = { params: Promise<{ id: string; tourId: string; addonId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, tourId, addonId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    await requireTour(id, tourId);
    const existing = await requireAddon(id, tourId, addonId);

    const body = await request.json().catch(() => null);
    const data = updateAddonSchema.parse(body);

    const addon = await prisma.tourAddon.update({
      where: { id: existing.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.maxPerBooking !== undefined ? { maxPerBooking: data.maxPerBooking } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });

    await recordAuditEvent({
      action: "addon_updated",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_addon",
      entityId: addon.id,
      metadata: { tourId, fields: Object.keys(data).join(",") },
      request,
    });

    return json({ addon });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id, tourId, addonId } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }
    await requireTour(id, tourId);
    const addon = await requireAddon(id, tourId, addonId);

    await prisma.tourAddon.delete({ where: { id: addon.id } });

    await recordAuditEvent({
      action: "addon_deleted",
      workspaceId: id,
      userId: user.id,
      entityType: "tour_addon",
      entityId: addon.id,
      metadata: { tourId, name: addon.name },
      request,
    });

    return json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
