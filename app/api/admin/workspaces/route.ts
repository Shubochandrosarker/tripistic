import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET() {
  try {
    await requirePlatformAdminApi();

    const workspaces = await prisma.workspace.findMany({
      where: { deletedAt: null },
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { email: true, name: true } },
        subscriptions: {
          where: { status: { in: ["trialing", "active", "past_due"] } },
          include: { plan: { select: { name: true, slug: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { members: true } },
      },
    });

    return json({
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        businessType: workspace.businessType,
        status: workspace.status,
        owner: workspace.owner,
        plan: workspace.subscriptions[0]?.plan.name ?? null,
        subscriptionStatus: workspace.subscriptions[0]?.status ?? null,
        memberCount: workspace._count.members,
        createdAt: workspace.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
