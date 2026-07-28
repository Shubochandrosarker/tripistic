import type { User, Workspace } from "@prisma/client";
import { badRequest, conflict } from "@/lib/api";
import { prisma } from "@/lib/db";
import { canonicalPlans, type BillingInterval, type CanonicalPlanSlug } from "@/lib/plans/catalog";
import { getStripeClient } from "@/lib/payments/stripe-client";

export type BillingCheckoutInput = {
  workspace: Pick<Workspace, "id" | "name" | "slug">;
  user: Pick<User, "id" | "email" | "name">;
  planSlug: CanonicalPlanSlug;
  interval: BillingInterval;
};

function appBaseUrl() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function stripePriceEnvName(planSlug: CanonicalPlanSlug, interval: BillingInterval): string {
  return `STRIPE_PRICE_${planSlug.toUpperCase()}_${interval.toUpperCase()}`;
}

export function buildBillingReturnUrl(workspaceSlug: string, state: "success" | "cancel") {
  return `${appBaseUrl()}/dashboard/billing?workspace=${encodeURIComponent(workspaceSlug)}&billing=${state}`;
}

function isPaidPlan(planSlug: CanonicalPlanSlug) {
  const plan = canonicalPlans.find((item) => item.slug === planSlug);
  return Boolean(plan?.monthlyPriceCents);
}

export async function resolveStripeSubscriptionPriceId(planSlug: CanonicalPlanSlug, interval: BillingInterval) {
  if (!isPaidPlan(planSlug)) {
    throw badRequest("This plan does not support self-serve checkout.");
  }

  const envValue = process.env[stripePriceEnvName(planSlug, interval)]?.trim();
  if (envValue) return envValue;

  const price = await prisma.planPrice.findFirst({
    where: {
      interval,
      isActive: true,
      plan: { slug: planSlug, isActive: true },
      providerPriceId: { not: null },
    },
    select: { providerPriceId: true },
  });
  if (price?.providerPriceId) return price.providerPriceId;

  throw conflict(
    `Stripe price is not configured for ${planSlug} ${interval}. Set ${stripePriceEnvName(planSlug, interval)} or seed provider_price_id.`,
  );
}

async function getOrCreateCustomer(input: BillingCheckoutInput) {
  const existing = await prisma.subscription.findFirst({
    where: { workspaceId: input.workspace.id, providerCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, providerCustomerId: true },
  });
  if (existing?.providerCustomerId) return existing.providerCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: input.user.email,
    name: input.user.name,
    metadata: {
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      userId: input.user.id,
    },
  });

  await prisma.subscription.updateMany({
    where: { workspaceId: input.workspace.id },
    data: { billingProvider: "stripe", providerCustomerId: customer.id },
  });

  return customer.id;
}

export async function createBillingCheckoutSession(input: BillingCheckoutInput) {
  const priceId = await resolveStripeSubscriptionPriceId(input.planSlug, input.interval);
  const customerId = await getOrCreateCustomer(input);
  const stripe = getStripeClient();

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: buildBillingReturnUrl(input.workspace.slug, "success"),
    cancel_url: buildBillingReturnUrl(input.workspace.slug, "cancel"),
    client_reference_id: input.workspace.id,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },
    subscription_data: {
      metadata: {
        workspaceId: input.workspace.id,
        planSlug: input.planSlug,
        interval: input.interval,
      },
    },
    metadata: {
      workspaceId: input.workspace.id,
      planSlug: input.planSlug,
      interval: input.interval,
      userId: input.user.id,
    },
  });
}

export async function createBillingPortalSession(workspace: Pick<Workspace, "id" | "slug">) {
  const subscription = await prisma.subscription.findFirst({
    where: { workspaceId: workspace.id, providerCustomerId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { providerCustomerId: true },
  });
  if (!subscription?.providerCustomerId) {
    throw conflict("No Stripe customer exists for this workspace yet.");
  }

  const stripe = getStripeClient();
  return stripe.billingPortal.sessions.create({
    customer: subscription.providerCustomerId,
    return_url: `${appBaseUrl()}/dashboard/billing?workspace=${encodeURIComponent(workspace.slug)}`,
  });
}
