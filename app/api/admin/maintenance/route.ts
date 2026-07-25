import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

const updateSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(300).optional().nullable(),
});

export async function GET() {
  try {
    await requirePlatformAdminApi();
    const maintenance = await prisma.maintenanceSetting.findUnique({
      where: { id: "platform" },
    });
    return json({ maintenance: maintenance ?? { id: "platform", enabled: false, message: null } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requirePlatformAdminApi();
    const input = updateSchema.parse(await request.json());
    const maintenance = await prisma.maintenanceSetting.upsert({
      where: { id: "platform" },
      create: {
        id: "platform",
        enabled: input.enabled,
        message: input.message || null,
        updatedById: user.id,
      },
      update: {
        enabled: input.enabled,
        message: input.message || null,
        updatedById: user.id,
      },
    });
    return json({ maintenance });
  } catch (error) {
    return handleApiError(error);
  }
}
