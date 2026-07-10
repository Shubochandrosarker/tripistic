import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET() {
  try {
    await requirePlatformAdminApi();

    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      take: 100,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { memberships: true } } },
    });

    return json({
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        isPlatformAdmin: user.isPlatformAdmin,
        workspaceCount: user._count.memberships,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
