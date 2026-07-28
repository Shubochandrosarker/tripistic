import type { Prisma, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma, type Db } from "@/lib/db";
import { uniqueViolationTargets } from "@/lib/prisma-errors";
import {
  billingIntervalFromStripeSubscription,
  markScheduledChangesApplied,
  paymentGraceEndsAt,
} from "@/lib/billing/subscription-lifecycle";

export type BillingWebhookResult = {
  duplicate: boolean;
  handled: boolean;
  workspaceId: string | null;
  subscriptionId: string | null;
};

const BILLING_EVENT_TYPES = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "subscription_schedule.canceled",
  "subscription_schedule.completed",
  "subscription_schedule.released",
  "subscription_schedule.updated",
]);

export function isStripeBillingEvent(event: Stripe.Event): boolean {
  if (BILLING_EVENT_TYPES.has(event.type)) return true;
  if (event.type !== "checkout.session.completed") return false;
  const session = event.data.object as Stripe.Checkout.Session;
  return session.mode === "subscription";
}

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
      return "past_due";
    case "canceled":
      return "cancelled";
    default:
      return "expired";
  }
}

export function isBillingEventUniqueViolation(error: unknown): boolean {
  return uniqueViolationTargets(error).some((target) => /provider_event/i.test(target));
}

function stringFrom(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function unixDate(value: unknown): Date | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const value = (invoice as unknown as { subscription?: string | { id?: string } | null }).subscription;
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

async function findWorkspaceIdForCustomer(tx: Db, customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const subscription = await tx.subscription.findFirst({
    where: { providerCustomerId: customerId },
    orderBy: { createdAt: "desc" },
    select: { workspaceId: true },
  });
  return subscription?.workspaceId ?? null;
}

async function planIdForStripePrice(tx: Db, priceId: string | null, planSlug: string | null): Promise<string | null> {
  if (priceId) {
    const price = await tx.planPrice.findUnique({
      where: { providerPriceId: priceId },
      select: { planId: true },
    });
    if (price) return price.planId;
  }
  if (planSlug) {
    const plan = await tx.plan.findUnique({ where: { slug: planSlug }, select: { id: true } });
    if (plan) return plan.id;
  }
  return null;
}

async function syncSubscriptionFromStripe(
  tx: Db,
  stripeSubscription: Stripe.Subscription,
): Promise<{ workspaceId: string | null; subscriptionId: string | null }> {
  const raw = stripeSubscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
    cancel_at_period_end?: boolean;
    cancel_at?: number | null;
    customer?: string | { id?: string } | null;
    items?: { data?: Array<{ price?: { id?: string | null } }> };
  };
  const customerId = typeof raw.customer === "string" ? raw.customer : (raw.customer?.id ?? null);
  const workspaceId =
    stringFrom(stripeSubscription.metadata?.workspaceId) ?? (await findWorkspaceIdForCustomer(tx, customerId));
  if (!workspaceId) return { workspaceId: null, subscriptionId: null };

  const planId = await planIdForStripePrice(
    tx,
    raw.items?.data?.[0]?.price?.id ?? null,
    stringFrom(stripeSubscription.metadata?.planSlug),
  );
  if (!planId) return { workspaceId, subscriptionId: null };

  const status = mapStripeSubscriptionStatus(stripeSubscription.status);
  const billingInterval = billingIntervalFromStripeSubscription(stripeSubscription);
  const data = {
    workspaceId,
    planId,
    status,
    billingInterval,
    billingProvider: "stripe",
    providerCustomerId: customerId,
    providerSubscriptionId: stripeSubscription.id,
    trialEndsAt: unixDate(stripeSubscription.trial_end),
    currentPeriodStart: unixDate(raw.current_period_start),
    currentPeriodEnd: unixDate(raw.current_period_end),
    cancelAtPeriodEnd: raw.cancel_at_period_end ?? false,
    cancelAt: unixDate(raw.cancel_at),
    ...(status === "active" || status === "trialing"
      ? { lastPaymentFailedAt: null, graceEndsAt: null }
      : {}),
  };

  const existing = await tx.subscription.findFirst({
    where: { providerSubscriptionId: stripeSubscription.id },
    select: { id: true },
  });
  const subscription = existing
    ? await tx.subscription.update({ where: { id: existing.id }, data })
    : await tx.subscription.create({ data });

  await markScheduledChangesApplied(tx, {
    subscriptionId: subscription.id,
    planId,
    interval: billingInterval,
    appliedAt: new Date(),
  });

  return { workspaceId, subscriptionId: subscription.id };
}

async function attachCheckoutSession(
  tx: Db,
  session: Stripe.Checkout.Session,
): Promise<{ workspaceId: string | null; subscriptionId: string | null }> {
  const workspaceId = stringFrom(session.metadata?.workspaceId) ?? stringFrom(session.client_reference_id);
  if (!workspaceId) return { workspaceId: null, subscriptionId: null };

  const providerCustomerId =
    typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const providerSubscriptionId =
    typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);

  const planId = await planIdForStripePrice(tx, null, stringFrom(session.metadata?.planSlug));
  if (!planId) return { workspaceId, subscriptionId: null };

  const existing = providerSubscriptionId
    ? await tx.subscription.findFirst({ where: { providerSubscriptionId }, select: { id: true } })
    : null;
  const subscription = existing
    ? await tx.subscription.update({
        where: { id: existing.id },
        data: { workspaceId, planId, billingProvider: "stripe", providerCustomerId, providerSubscriptionId },
      })
    : await tx.subscription.create({
        data: {
          workspaceId,
          planId,
          status: "trialing",
          billingInterval: stringFrom(session.metadata?.interval),
          billingProvider: "stripe",
          providerCustomerId,
          providerSubscriptionId,
        },
      });

  return { workspaceId, subscriptionId: subscription.id };
}

async function markFromInvoice(
  tx: Db,
  invoice: Stripe.Invoice,
  status: SubscriptionStatus,
): Promise<{ workspaceId: string | null; subscriptionId: string | null }> {
  const providerSubscriptionId = subscriptionIdFromInvoice(invoice);
  const providerCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  const subscription = await tx.subscription.findFirst({
    where: {
      OR: [
        ...(providerSubscriptionId ? [{ providerSubscriptionId }] : []),
        ...(providerCustomerId ? [{ providerCustomerId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, workspaceId: true },
  });
  if (!subscription) return { workspaceId: null, subscriptionId: null };
  const failedAt = new Date();
  await tx.subscription.update({
    where: { id: subscription.id },
    data:
      status === "active"
        ? { status, lastPaymentFailedAt: null, graceEndsAt: null }
        : { status, lastPaymentFailedAt: failedAt, graceEndsAt: paymentGraceEndsAt(failedAt) },
  });
  return { workspaceId: subscription.workspaceId, subscriptionId: subscription.id };
}

async function markSubscriptionSchedule(
  tx: Db,
  schedule: Stripe.SubscriptionSchedule,
): Promise<{ workspaceId: string | null; subscriptionId: string | null }> {
  const change = await tx.subscriptionChange.findUnique({
    where: { providerScheduleId: schedule.id },
    select: { id: true, workspaceId: true, subscriptionId: true },
  });
  if (!change) return { workspaceId: null, subscriptionId: null };

  if (schedule.status === "canceled" || schedule.status === "released") {
    await tx.subscriptionChange.update({
      where: { id: change.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
  }
  if (schedule.status === "completed") {
    await tx.subscriptionChange.update({
      where: { id: change.id },
      data: { status: "applied", appliedAt: new Date() },
    });
  }

  return { workspaceId: change.workspaceId, subscriptionId: change.subscriptionId };
}

async function dispatchBillingEvent(
  tx: Db,
  event: Stripe.Event,
): Promise<{ workspaceId: string | null; subscriptionId: string | null }> {
  switch (event.type) {
    case "checkout.session.completed":
      return attachCheckoutSession(tx, event.data.object as Stripe.Checkout.Session);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return syncSubscriptionFromStripe(tx, event.data.object as Stripe.Subscription);
    case "invoice.paid":
      return markFromInvoice(tx, event.data.object as Stripe.Invoice, "active");
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      return markFromInvoice(tx, event.data.object as Stripe.Invoice, "past_due");
    case "subscription_schedule.canceled":
    case "subscription_schedule.completed":
    case "subscription_schedule.released":
    case "subscription_schedule.updated":
      return markSubscriptionSchedule(tx, event.data.object as Stripe.SubscriptionSchedule);
    default:
      return { workspaceId: null, subscriptionId: null };
  }
}

export async function processStripeBillingWebhookEvent(event: Stripe.Event): Promise<BillingWebhookResult> {
  if (!isStripeBillingEvent(event)) {
    return { duplicate: false, handled: false, workspaceId: null, subscriptionId: null };
  }

  let outcome: { workspaceId: string | null; subscriptionId: string | null } = {
    workspaceId: null,
    subscriptionId: null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const billingEvent = await tx.billingEvent.create({
        data: {
          providerEventId: event.id,
          provider: "stripe",
          eventType: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });

      outcome = await dispatchBillingEvent(tx, event);

      await tx.billingEvent.update({
        where: { id: billingEvent.id },
        data: {
          workspaceId: outcome.workspaceId,
          subscriptionId: outcome.subscriptionId,
          processedAt: new Date(),
        },
      });
    });
  } catch (error) {
    if (isBillingEventUniqueViolation(error)) {
      return { duplicate: true, handled: true, workspaceId: null, subscriptionId: null };
    }
    throw error;
  }

  return { duplicate: false, handled: true, ...outcome };
}
