import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET() {
  try {
    await requirePlatformAdminApi();
    const domains = await prisma.customDomain.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { workspace: { select: { id: true, name: true, slug: true } } },
    });
    return json({ domains });
  } catch (error) {
    return handleApiError(error);
  }
}
