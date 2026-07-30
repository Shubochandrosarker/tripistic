import type { Metadata } from "next";
import { CalendarClock, CreditCard, DollarSign, TrendingUp, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { getRevenueSnapshot } from "@/lib/billing/revenue";
import { formatDate, formatMoney } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Revenue · Admin",
};

export default async function AdminRevenuePage() {
  const [revenue, subscriptions, succeededPayments, pendingChanges] = await Promise.all([
    // Aggregated in the database: complete regardless of subscription count,
    // interval-normalized, and never combining currencies.
    getRevenueSnapshot(),
    prisma.subscription.findMany({
      where: { status: { in: ["trialing", "active", "past_due"] } },
      include: {
        plan: true,
        workspace: { select: { name: true, slug: true } },
        scheduledChanges: {
          where: { status: "scheduled" },
          include: { toPlan: true },
          orderBy: { effectiveAt: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.payment.aggregate({
      where: { status: "succeeded" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.subscriptionChange.count({ where: { status: "scheduled" } }),
  ]);

  // The table below still shows a recent page of billing records; the metrics
  // above come from the full aggregate, so they no longer silently truncate.
  const primary = revenue.byCurrency[0] ?? null;
  const otherCurrencies = revenue.byCurrency.slice(1);

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Platform revenue, MRR, ARR, and plan mix across active subscriptions."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={DollarSign}
          label="MRR"
          value={primary ? formatMoney(primary.mrrMinor, primary.currency) : "—"}
          hint={
            otherCurrencies.length > 0
              ? `${primary?.currency} — plus ${otherCurrencies.length} other currency${otherCurrencies.length === 1 ? "" : "s"}, shown below`
              : "Interval-normalized across active subscriptions"
          }
        />
        <MetricCard
          icon={TrendingUp}
          label="ARR"
          value={primary ? formatMoney(primary.arrMinor, primary.currency) : "—"}
          hint="MRR annualized"
        />
        <MetricCard icon={CreditCard} label="Succeeded payments" value={formatMoney(succeededPayments._sum.amount ?? 0)} hint={`${succeededPayments._count} guest payments`} />
        <MetricCard
          icon={Users}
          label="Active subscriptions"
          value={String(revenue.totalActive)}
          hint={`${revenue.trialing} trialing · ${revenue.pastDue} past due`}
        />
        <MetricCard icon={CalendarClock} label="Scheduled changes" value={String(pendingChanges)} hint="Plan changes queued at renewal" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Plan Mix">
          <div className="space-y-3">
            {revenue.planMix.map((plan) => (
              <div key={plan.slug}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{plan.name}</span>
                  <span className="text-muted-foreground">
                    {plan.subscriptions} subscriptions · {plan.sharePercent}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    // A real share of active subscriptions. The previous bar
                    // was `count * 12%`, which saturated at nine subscribers
                    // and represented nothing.
                    style={{ width: `${plan.sharePercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Revenue Notes" description="Stripe Connect and metered SaaS billing are ready to be layered on this model.">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>MRR is aggregated in the database across every active subscription — not a page — and normalized by billing interval, so an annual subscriber counts as its monthly equivalent.</li>
            <li>Currencies are reported separately and never summed. Where more than one is in use, additional currencies are listed below.</li>
            <li>Plan mix is a true share of active subscriptions.</li>
            <li>Guest payment volume is summed from succeeded payment rows and is gross — refunds are not yet deducted.</li>
          </ul>
        </SectionCard>
      </div>

      <TableShell
        headers={["Workspace", "Plan", "Status", "Interval", "Renewal", "Grace", "Pending Change"]}
        isEmpty={subscriptions.length === 0}
        emptyMessage="No subscription records yet."
      >
        {subscriptions.map((subscription) => {
          const change = subscription.scheduledChanges[0];
          return (
            <tr key={subscription.id}>
              <Td>
                <span className="font-medium">{subscription.workspace.name}</span>
                <span className="block text-xs text-muted-foreground">/{subscription.workspace.slug}</span>
              </Td>
              <Td>
                <span>{subscription.plan.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatMoney(subscription.plan.priceMonthly, subscription.plan.currency)}/mo
                </span>
              </Td>
              <Td>
                <StatusBadge status={subscription.status} />
              </Td>
              <Td className="text-muted-foreground">{subscription.billingInterval ?? "monthly"}</Td>
              <Td className="text-muted-foreground">
                {subscription.currentPeriodEnd ? formatDate(subscription.currentPeriodEnd) : "Not synced"}
              </Td>
              <Td className="text-muted-foreground">
                {subscription.graceEndsAt ? formatDate(subscription.graceEndsAt) : "None"}
              </Td>
              <Td className="text-muted-foreground">
                {change
                  ? `${change.toPlan.name} ${change.interval} on ${formatDate(change.effectiveAt)}`
                  : "None"}
              </Td>
            </tr>
          );
        })}
      </TableShell>
    </>
  );
}
