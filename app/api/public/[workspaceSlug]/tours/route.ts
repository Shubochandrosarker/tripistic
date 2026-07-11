import { prisma } from "@/lib/db";
import { handleApiError, noStoreJson } from "@/lib/api";
import { requirePublicWorkspace } from "@/lib/tenancy/public";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ workspaceSlug: string }> };

/** Public tour catalog for a workspace's booking page. Active + public + not deleted only. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceSlug } = await params;
    const workspace = await requirePublicWorkspace(workspaceSlug);

    const tours = await prisma.tour.findMany({
      where: { workspaceId: workspace.id, status: "active", visibility: "public", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        slug: true,
        title: true,
        kind: true,
        durationMinutes: true,
        durationDays: true,
        location: true,
        coverImageUrl: true,
        basePrice: true,
        currency: true,
      },
    });

    return noStoreJson({
      workspace: { name: workspace.name, slug: workspace.slug, currency: workspace.currency },
      tours,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
