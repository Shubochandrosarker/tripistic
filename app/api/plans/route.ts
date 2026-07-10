import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";

/** Public: active plan catalog (used by pricing surfaces). */
export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        currency: true,
        features: true,
        limits: true,
      },
    });
    return json({ plans });
  } catch (error) {
    return handleApiError(error);
  }
}
