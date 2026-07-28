import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { badRequest, conflict } from "@/lib/api";
import { prisma, type Db } from "@/lib/db";
import { type BillingInterval, type CanonicalPlanSlug, getCanonicalPlan } from "@/lib/plans/catalog";
import { getStripeClient } from "@/lib/payments/stripe-client";
import { resolveStripeSubscriptionPriceId } from "@/lib/billing/stripe-billing";

export type SubscriptionPreview = {
  amountDue: number;
  amountRemaining: number;
  subtotal: number;
  total: number;
  currency: string;
  prorationDate: number;
  lines: Array<{
    id: string;
    description: string | null;
    amount: number;
    currency: string;
    periodStart: number | null;
    periodEnd: number | null;
  }>;
};

export type ScheduledSubscriptionChange = {
  id: string;
  providerScheduleId: string | null;
  effectiveAt: Date;
  targetPlanName: string;
  interval: BillingInterval;
};

export function subscriptionPaymentGraceDays(): number {
  const raw = Number.parseInt(process.env.SUBSCRIPTION_PAYMENT_GRACE_DAYS ?? "7", 10);
  if (!Number.isFinite(raw) || raw < 0) return 7;
  return raw;
}

export function paymentGraceEndsAt(referenceDate = new Date(), days = subscriptionPaymentGraceDays()): Date {
  return new Date(referenceDate.getTime() + days * 24 * 60 * 60 * 1000);
}

export function billingIntervalFromStripeSubscription(stripeSubscription: Stripe.Subscription): BillingInterval | null {
  const raw = stripeSubscription as unknown as {
    items?: { data?: Array<{ price?: { recurring?: { interval?: string | null } | null } | null }> };
  };
  const interval = raw.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

function assertSelfServePlan(planSlug: CanonicalPlanSlug) {
  const plan = getCanonicalPlan(planSlug);
  if (plan.monthlyPriceCents === null || plan.yearlyPriceCents === null) {
    throw badRequest("Enterprise billing is not available through self-serve plan changes.");
  }
  return plan;
}

async function getManagedBillingSubscription(workspaceId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { workspaceId, status: { in: ["trialing", "active", "past_due"] } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription) {
    throw conflict("No active subscription record exists for this workspace.");
  }
  if (!subscription.providerCustomerId || !subscription.providerSubscriptionId) {
    throw conflict("This workspace does not have an active Stripe subscription yet.");
  }
  return subscription as typeof subscription & {
    providerCustomerId: string;
    providerSubscriptionId: string;
  };
}

function stripeSubscriptionItem(stripeSubscription: Stripe.Subscription) {
  const raw = stripeSubscription as unknown as {
    items?: {
      data?: Array<{
        id?: string;
        quantity?: number | null;
        price?: string | { id?: string | null } | null;
      }>;
    };
  };
  const item = raw.items?.data?.[0];
  const priceId = typeof item?.price === "string" ? item.price : item?.price?.id;
  if (!item?.id || !priceId) {
    throw conflict("Stripe subscription does not have a replaceable subscription item.");
  }
  return {
    id: item.id,
    priceId,
    quantity: item.quantity ?? 1,
  };
}

function unix(value: Date): number {
  return Math.floor(value.getTime() / 1000);
}

function linePeriod(value: unknown) {
  const raw = value as unknown as { period?: { start?: number | null; end?: number | null } };
  return {
    periodStart: raw.period?.start ?? null,
    periodEnd: raw.period?.end ?? null,
  };
}

export async function createSubscriptionChangePreview(
  workspaceId: string,
  planSlug: CanonicalPlanSlug,
  interval: BillingInterval,
): Promise<SubscriptionPreview> {
  assertSelfServePlan(planSlug);
  const [subscription, targetPriceId] = await Promise.all([
    getManagedBillingSubscription(workspaceId),
    resolveStripeSubscriptionPriceId(planSlug, interval),
  ]);

  const stripe = getStripeClient();
  const stripeSubscription = await stripe.subscriptions.retrieve(subscription.providerSubscriptionId, {
    expand: ["items.data.price"],
  });
  const item = stripeSubscriptionItem(stripeSubscription);
  const prorationDate = unix(new Date());
  const invoice = await stripe.invoices.createPreview({
    customer: subscription.providerCustomerId,
    subscription: subscription.providerSubscriptionId,
    subscription_details: {
      items: [{ id: item.id, price: targetPriceId, quantity: item.quantity }],
      proration_behavior: "create_prorations",
      proration_date: prorationDate,
    },
  });

  return {
    amountDue: invoice.amount_due,
    amountRemaining: invoice.amount_remaining,
    subtotal: invoice.subtotal,
    total: invoice.total,
    currency: invoice.currency.toUpperCase(),
    prorationDate,
    lines: invoice.lines.data.slice(0, 8).map((line) => ({
      id: line.id,
      description: line.description,
      amount: line.amount,
      currency: line.currency.toUpperCase(),
      ...linePeriod(line),
    })),
  };
}

function scheduleIdFromSubscription(stripeSubscription: Stripe.Subscription): string | null {
  const schedule = stripeSubscription.schedule;
  if (!schedule) return null;
  return typeof schedule === "string" ? schedule : schedule.id;
}

function currentPeriodWindow(stripeSubscription: Stripe.Subscription) {
  const raw = stripeSubscription as unknown as {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  if (!raw.current_period_end) {
    throw conflict("Stripe subscription does not expose a current period end.");
  }
  return {
    startsAt: raw.current_period_start ?? unix(new Date()),
    endsAt: raw.current_period_end,
  };
}

async function resolveScheduleId(stripe: Stripe, stripeSubscription: Stripe.Subscription): Promise<string> {
  const existingScheduleId = scheduleIdFromSubscription(stripeSubscription);
  if (existingScheduleId) return existingScheduleId;

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: stripeSubscription.id,
  });
  return schedule.id;
}

export async function scheduleSubscriptionChange({
  workspaceId,
  requestedById,
  planSlug,
  interval,
}: {
  workspaceId: string;
  requestedById: string;
  planSlug: CanonicalPlanSlug;
  interval: BillingInterval;
}): Promise<ScheduledSubscriptionChange> {
  const targetPlan = assertSelfServePlan(planSlug);
  const [subscription, targetPriceId, targetPlanRow] = await Promise.all([
    getManagedBillingSubscription(workspaceId),
    resolveStripeSubscriptionPriceId(planSlug, interval),
    prisma.plan.findUnique({ where: { slug: planSlug } }),
  ]);
  if (!targetPlanRow) {
    throw conflict(`Plan ${targetPlan.name} has not been seeded yet.`);
  }

  const stripe = getStripeClient();
  const stripeSubscription = await stripe.subscriptions.retrieve(subscription.providerSubscriptionId, {
    expand: ["items.data.price", "schedule"],
  });
  const currentItem = stripeSubscriptionItem(stripeSubscription);
  const currentInterval = subscription.billingInterval ?? billingIntervalFromStripeSubscription(stripeSubscription);
  if (subscription.plan.slug === planSlug && currentInterval === interval) {
    throw badRequest("The workspace is already on that plan and billing interval.");
  }

  const period = currentPeriodWindow(stripeSubscription);
  const scheduleId = await resolveScheduleId(stripe, stripeSubscription);
  const schedule = await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: "release",
    proration_behavior: "none",
    metadata: {
      workspaceId,
      planSlug,
      interval,
      requestedById,
    },
    phases: [
      {
        start_date: period.startsAt,
        end_date: period.endsAt,
        items: [{ price: currentItem.priceId, quantity: currentItem.quantity }],
        metadata: {
          workspaceId,
          planSlug: subscription.plan.slug,
          interval: currentInterval ?? "",
        },
      },
      {
        start_date: period.endsAt,
        items: [{ price: targetPriceId, quantity: 1 }],
        proration_behavior: "none",
        metadata: {
          workspaceId,
          planSlug,
          interval,
        },
      },
    ],
  });

  const effectiveAt = new Date(period.endsAt * 1000);
  const change = await prisma.$transaction(async (tx) => {
    await tx.subscriptionChange.updateMany({
      where: { subscriptionId: subscription.id, status: "scheduled" },
      data: { status: "cancelled", cancelledAt: new Date() },
    });

    return tx.subscriptionChange.create({
      data: {
        workspaceId,
        subscriptionId: subscription.id,
        fromPlanId: subscription.planId,
        toPlanId: targetPlanRow.id,
        interval,
        providerScheduleId: schedule.id,
        effectiveAt,
        requestedById,
        metadata: {
          targetPriceId,
          previousPriceId: currentItem.priceId,
        } satisfies Prisma.InputJsonObject,
      },
    });
  });

  return {
    id: change.id,
    providerScheduleId: change.providerScheduleId,
    effectiveAt: change.effectiveAt,
    targetPlanName: targetPlanRow.name,
    interval,
  };
}

export async function markScheduledChangesApplied(
  tx: Db,
  input: { subscriptionId: string; planId: string; interval: BillingInterval | null; appliedAt?: Date },
) {
  const appliedAt = input.appliedAt ?? new Date();
  await tx.subscriptionChange.updateMany({
    where: {
      subscriptionId: input.subscriptionId,
      toPlanId: input.planId,
      status: "scheduled",
      effectiveAt: { lte: appliedAt },
      ...(input.interval ? { interval: input.interval } : {}),
    },
    data: { status: "applied", appliedAt },
  });
}
