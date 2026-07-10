import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";
import { requirePlatformAdminApi } from "@/lib/auth/guards";

export async function GET() {
  try {
    await requirePlatformAdminApi();

    const plans = await prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
      include: { _count: { select: { subscriptions: true } } },
    });

    return json({
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        features: plan.features,
        limits: plan.limits,
        isActive: plan.isActive,
        subscriptionCount: plan._count.subscriptions,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
