import { prisma } from "@/lib/db";
import { forbidden, handleApiError, json } from "@/lib/api";
import { requireUserApi } from "@/lib/auth/session";
import { requireWorkspaceAccess } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { createTourSchema } from "@/lib/validation";
import { generateTourSlug } from "@/lib/tours/service";

type Params = { params: Promise<{ id: string }> };

/** Tour catalog for the workspace (any active member; viewers read-only). */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    await requireWorkspaceAccess(user.id, id);

    const tours = await prisma.tour.findMany({
      where: { workspaceId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        _count: {
          select: {
            availabilities: {
              where: { status: "scheduled", startsAt: { gt: new Date() } },
            },
            addons: { where: { isActive: true } },
          },
        },
      },
    });

    return json({
      tours: tours.map((tour) => ({
        id: tour.id,
        title: tour.title,
        slug: tour.slug,
        kind: tour.kind,
        status: tour.status,
        visibility: tour.visibility,
        durationMinutes: tour.durationMinutes,
        durationDays: tour.durationDays,
        location: tour.location,
        capacity: tour.capacity,
        basePrice: tour.basePrice,
        currency: tour.currency,
        upcomingSlots: tour._count.availabilities,
        addonCount: tour._count.addons,
        createdAt: tour.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Create a tour (owner/admin). */
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const user = await requireUserApi();
    const membership = await requireWorkspaceAccess(user.id, id);
    if (!canManageTours(membership.role)) {
      throw forbidden("Only workspace owners and admins can manage tours.");
    }

    const body = await request.json().catch(() => null);
    const data = createTourSchema.parse(body);

    const slug = await generateTourSlug(id, data.title);
    const tour = await prisma.tour.create({
      data: {
        workspaceId: id,
        title: data.title,
        slug,
        kind: data.kind,
        description: data.description ?? null,
        durationMinutes: data.durationMinutes,
        durationDays: data.durationDays ?? null,
        location: data.location ?? null,
        meetingPoint: data.meetingPoint ?? null,
        capacity: data.capacity,
        basePrice: data.basePrice,
        currency: data.currency ?? membership.workspace.currency,
        visibility: data.visibility,
        cancellationPolicy: data.cancellationPolicy ?? null,
        cancellationNoticeHours: data.cancellationNoticeHours ?? null,
        waiverRequired: data.waiverRequired,
        coverImageUrl: data.coverImageUrl ?? null,
        createdById: user.id,
      },
    });

    await recordAuditEvent({
      action: "tour_created",
      workspaceId: id,
      userId: user.id,
      entityType: "tour",
      entityId: tour.id,
      metadata: { title: tour.title, kind: tour.kind },
      request,
    });

    return json({ tour: { id: tour.id, slug: tour.slug, title: tour.title } }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
