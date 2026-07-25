import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET() {
  try {
    await requirePlatformAdminApi();
    const providers = await prisma.aiProviderConfig.findMany({
      orderBy: [{ isDefault: "desc" }, { provider: "asc" }],
    });
    return json({
      providers,
      env: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY),
        gateway: Boolean(process.env.AI_GATEWAY_URL),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
