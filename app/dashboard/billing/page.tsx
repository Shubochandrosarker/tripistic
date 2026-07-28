import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard, Info } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { getWorkspaceSubscription } from "@/lib/plans/limits";
import { canManageBilling } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { cn, daysUntil, formatDate, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import {
  BillingCheckoutButton,
  BillingPortalButton,
  BillingScheduleChangeButton,
} from "@/components/billing/billing-actions";

export const metadata: Metadata = {
  title: "Billing",
};

export default async function BillingPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const [subscription, plans, pendingChange] = await Promise.all([
    getWorkspaceSubscription(active.workspace.id),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } }),
    prisma.subscriptionChange.findFirst({
      where: { workspaceId: active.workspace.id, status: "scheduled" },
      include: { toPlan: true },
      orderBy: { effectiveAt: "asc" },
    }),
  ]);

  const trialDays = daysUntil(subscription?.trialEndsAt ?? null);
  const billingAllowed = canManageBilling(active.role);

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your plan, trial status, and upcoming billing capabilities."
      />

      <SectionCard
        title="Current plan"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {subscription ? <StatusBadge status={subscription.status} /> : null}
            {billingAllowed ? <BillingPortalButton disabled={!subscription?.providerCustomerId} /> : null}
          </div>
        }
      >
        {subscription ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-foreground">{subscription.plan.name}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {subscription.plan.description}
              </p>
              {subscription.status === "trialing" && subscription.trialEndsAt ? (
                <p className="mt-2 text-sm text-foreground">
                  Free trial ends{" "}
                  <span className="font-medium">{formatDate(subscription.trialEndsAt)}</span>
                  {trialDays !== null ? (
                    <span className="text-muted-foreground"> — {trialDays} days left</span>
                  ) : null}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border px-2 py-1">
                  {subscription.billingInterval === "yearly" ? "Annual billing" : "Monthly billing"}
                </span>
                {subscription.currentPeriodEnd ? (
                  <span className="rounded-full border border-border px-2 py-1">
                    Renews {formatDate(subscription.currentPeriodEnd)}
                  </span>
                ) : null}
                {subscription.graceEndsAt ? (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    Payment grace ends {formatDate(subscription.graceEndsAt)}
                  </span>
                ) : null}
              </div>
              {pendingChange ? (
                <p className="mt-3 text-sm text-foreground">
                  Scheduled change:{" "}
                  <span className="font-medium">{pendingChange.toPlan.name}</span> on{" "}
                  <span className="font-medium">{formatDate(pendingChange.effectiveAt)}</span>
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-foreground">
                {formatMoney(subscription.plan.priceMonthly, subscription.plan.currency)}
                <span className="text-sm font-normal text-muted-foreground">/month</span>
              </p>
              <p className="text-xs text-muted-foreground">
                or {formatMoney(subscription.plan.priceYearly, subscription.plan.currency)}/year
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No subscription record found for this workspace. This shouldn&apos;t normally happen —
            contact support.
          </p>
        )}
      </SectionCard>

      <UpgradePrompt planName={subscription?.plan.name ?? "current"} />

      <SectionCard
        title="Available plans"
        description="Flat monthly pricing. 0% Tripistic commission on direct bookings, always."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.id === subscription?.planId;
            const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
            return (
              <div
                key={plan.id}
                className={cn(
                  "rounded-xl border p-4",
                  isCurrent ? "border-accent bg-accent/5" : "border-border bg-card",
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                  {isCurrent ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xl font-semibold text-foreground">
                  {formatMoney(plan.priceMonthly, plan.currency)}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </p>
                <ul className="mt-3 space-y-1">
                  {features.slice(0, 5).map((feature) => (
                    <li key={feature} className="text-xs text-muted-foreground">
                      • {feature}
                    </li>
                  ))}
                </ul>
                {billingAllowed && plan.priceMonthly > 0 && !isCurrent ? (
                  <div className="mt-4 grid gap-2">
                    {subscription?.providerSubscriptionId ? (
                      <>
                        <BillingScheduleChangeButton planSlug={plan.slug} interval="monthly" />
                        <BillingScheduleChangeButton planSlug={plan.slug} interval="yearly" />
                      </>
                    ) : (
                      <>
                        <BillingCheckoutButton planSlug={plan.slug} interval="monthly" />
                        <BillingCheckoutButton planSlug={plan.slug} interval="yearly" />
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Payments & subscriptions">
        <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <div className="text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Guest payments are live.</span> Guests
              pay securely through Stripe Checkout and bookings confirm automatically on success.
              Direct payouts to your own connected Stripe account (instead of via Tripistic) are
              still being completed. SaaS plan checkout, billing portal access, previews, and
              renewal-date plan changes are wired through Stripe Billing.
            </p>
            {!billingAllowed ? (
              <p className="mt-2 flex items-center gap-1.5 text-xs">
                <CreditCard className="size-3.5" aria-hidden />
                Only the workspace owner can manage billing.
              </p>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </>
  );
}
