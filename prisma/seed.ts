/**
 * Tripistic seed — idempotent.
 * - Upserts the four SaaS plans and their plan-default feature flags.
 * - Optionally creates/updates a platform admin, ONLY when SEED_ADMIN_EMAIL and
 *   SEED_ADMIN_PASSWORD are provided via environment. No hardcoded credentials.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type PlanSeed = {
  slug: string;
  name: string;
  description: string;
  priceMonthly: number; // cents
  priceYearly: number; // cents
  features: string[];
  limits: Record<string, number>;
  flags: Record<string, boolean>;
};

const PLANS: PlanSeed[] = [
  {
    slug: "solo",
    name: "Solo",
    description: "For solo guides launching direct bookings.",
    priceMonthly: 1900,
    priceYearly: 19000,
    features: [
      "1 user",
      "3 tour products",
      "Booking widget",
      "Stripe payments",
      "Email confirmations",
      "Basic waiver",
      "Basic CRM",
      "Basic AI insights",
      "0% direct-booking commission",
    ],
    limits: { users: 1, tour_products: 3, ai_credits_monthly: 50 },
    flags: {
      booking_engine: true,
      stripe_payments: true,
      digital_waivers: true,
      guide_scheduling: false,
      ai_growth_dashboard: false,
      ota_sync: false,
      white_label: false,
      custom_domain: false,
    },
  },
  {
    slug: "operator",
    name: "Operator",
    description: "Full operations for small tour companies.",
    priceMonthly: 6900,
    priceYearly: 69000,
    features: [
      "Up to 5 users",
      "Unlimited tour products",
      "Advanced availability",
      "Deposits & installments",
      "Digital waivers",
      "Guide scheduling",
      "Guest CRM",
      "AI Growth Dashboard",
      "Basic OTA sync",
      "0% direct-booking commission",
    ],
    limits: { users: 5, tour_products: -1, ai_credits_monthly: 250 },
    flags: {
      booking_engine: true,
      stripe_payments: true,
      digital_waivers: true,
      guide_scheduling: true,
      ai_growth_dashboard: true,
      ota_sync: true,
      white_label: false,
      custom_domain: false,
    },
  },
  {
    slug: "growth",
    name: "Growth",
    description: "Serious automation and growth tools for growing teams.",
    priceMonthly: 9900,
    priceYearly: 99000,
    features: [
      "Up to 15 users",
      "Advanced AI Growth Dashboard",
      "Demand forecasting",
      "AI booking agent",
      "AI marketing assistant",
      "No-show prediction",
      "Advanced reports",
      "Zapier/Make integration",
      "Priority support",
    ],
    limits: { users: 15, tour_products: -1, ai_credits_monthly: 1000 },
    flags: {
      booking_engine: true,
      stripe_payments: true,
      digital_waivers: true,
      guide_scheduling: true,
      ai_growth_dashboard: true,
      ota_sync: true,
      white_label: false,
      custom_domain: false,
    },
  },
  {
    slug: "agency",
    name: "Agency",
    description: "Multi-client management for agencies and consultants.",
    priceMonthly: 19900,
    priceYearly: 199000,
    features: [
      "Multi-client dashboard",
      "White-label option",
      "Branded reports",
      "Agency onboarding tools",
      "Template library",
      "Advanced permissions",
    ],
    limits: { users: -1, tour_products: -1, ai_credits_monthly: 2500 },
    flags: {
      booking_engine: true,
      stripe_payments: true,
      digital_waivers: true,
      guide_scheduling: true,
      ai_growth_dashboard: true,
      ota_sync: true,
      white_label: true,
      custom_domain: true,
    },
  },
];

async function seedPlans() {
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
