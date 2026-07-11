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

export const metadata: Metadata = {
  title: "Billing",
};

export default async function BillingPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const [subscription, plans] = await Promise.all([
    getWorkspaceSubscription(active.workspace.id),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMonthly: "asc" } }),
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
        actions={subscription ? <StatusBadge status={subscription.status} /> : null}
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
              Direct payouts to your own connected Stripe account (instead of via Tripistic) and
              self-serve plan upgrades with Stripe subscriptions arrive in a later phase.
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
