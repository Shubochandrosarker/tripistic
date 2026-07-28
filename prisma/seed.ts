/**
 * Tripistic seed — idempotent.
 * - Upserts the four SaaS plans and their plan-default feature flags.
 * - Optionally creates/updates a platform admin, ONLY when SEED_ADMIN_EMAIL and
 *   SEED_ADMIN_PASSWORD are provided via environment. No hardcoded credentials.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { canonicalPlans } from "../lib/plans/catalog";

const prisma = new PrismaClient();

type PlanSeed = {
  slug: string;
  name: string;
  description: string;
  priceMonthly: number; // cents; 0 means contact sales/custom in the current schema.
  priceYearly: number; // cents; 0 means contact sales/custom in the current schema.
  features: string[];
  limits: Record<string, number>;
  flags: Record<string, boolean>;
};

const PLANS: PlanSeed[] = canonicalPlans.map((plan) => ({
  slug: plan.slug,
  name: plan.name,
  description: plan.description,
  priceMonthly: plan.monthlyPriceCents ?? 0,
  priceYearly: plan.yearlyPriceCents ?? 0,
  features: [...plan.features],
  limits: plan.limits,
  flags: plan.flags,
}));

async function seedPlans() {
  await prisma.plan.updateMany({
    where: { slug: { notIn: PLANS.map((plan) => plan.slug) } },
    data: { isActive: false },
  });

  for (const plan of PLANS) {
    const record = await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: "USD",
        features: plan.features,
        limits: plan.limits,
        isActive: true,
      },
      update: {
        name: plan.name,
        description: plan.description,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        features: plan.features,
        limits: plan.limits,
        isActive: true,
      },
    });

    for (const interval of ["monthly", "yearly"] as const) {
      const amount = interval === "monthly" ? plan.priceMonthly : plan.priceYearly;
      const existing = await prisma.planPrice.findFirst({
        where: { planId: record.id, interval, currency: "USD" },
      });
      if (existing) {
        await prisma.planPrice.update({
          where: { id: existing.id },
          data: {
            amount,
            billingProvider: amount > 0 ? "stripe" : null,
            isActive: amount > 0,
          },
        });
      } else {
        await prisma.planPrice.create({
          data: {
            planId: record.id,
            interval,
            amount,
            currency: "USD",
            billingProvider: amount > 0 ? "stripe" : null,
            isActive: amount > 0,
          },
        });
      }
    }

    const entitlementEntries = [
      ...Object.entries(plan.flags).map(([key, enabled]) => ({ key, enabled, limitValue: null })),
      ...Object.entries(plan.limits).map(([key, limitValue]) => ({ key, enabled: true, limitValue })),
    ];
    for (const entitlement of entitlementEntries) {
      const existing = await prisma.entitlement.findFirst({
        where: { planId: record.id, key: entitlement.key },
      });
      if (existing) {
        await prisma.entitlement.update({
          where: { id: existing.id },
          data: {
            enabled: entitlement.enabled,
            limitValue: entitlement.limitValue,
          },
        });
      } else {
        await prisma.entitlement.create({
          data: {
            planId: record.id,
            key: entitlement.key,
            enabled: entitlement.enabled,
            limitValue: entitlement.limitValue,
          },
        });
      }
    }

    for (const [featureKey, enabled] of Object.entries(plan.flags)) {
      const existing = await prisma.featureFlag.findFirst({
        where: { planId: record.id, workspaceId: null, featureKey },
      });
      if (existing) {
        await prisma.featureFlag.update({
          where: { id: existing.id },
          data: { enabled },
        });
      } else {
        await prisma.featureFlag.create({
          data: { planId: record.id, featureKey, enabled },
        });
      }
    }
    console.log(`✓ plan ${plan.slug}`);
  }
}

async function seedPlatformAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME?.trim() || "Platform Admin";

  if (!email || !password) {
    console.log("↷ platform admin skipped (set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one)");
    return;
  }
  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name,
      passwordHash,
      isPlatformAdmin: true,
      emailVerifiedAt: new Date(),
    },
    update: {
      isPlatformAdmin: true,
    },
  });
  console.log(`✓ platform admin ${email}`);
}

async function main() {
  await seedPlans();
  await seedPlatformAdmin();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
