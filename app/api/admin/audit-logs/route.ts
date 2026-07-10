import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET(request: Request) {
  try {
    await requirePlatformAdminApi();

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? 100);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 100;

    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { email: true } },
        workspace: { select: { name: true, slug: true } },
      },
    });

    return json({
      auditLogs: logs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        actorEmail: log.user?.email ?? null,
        workspace: log.workspace ? { name: log.workspace.name, slug: log.workspace.slug } : null,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
