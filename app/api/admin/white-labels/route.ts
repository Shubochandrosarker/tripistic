import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET() {
  try {
    await requirePlatformAdminApi();
    const whiteLabels = await prisma.workspaceWhiteLabel.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: { workspace: { select: { id: true, name: true, slug: true } } },
    });
    return json({ whiteLabels });
  } catch (error) {
    return handleApiError(error);
  }
}
