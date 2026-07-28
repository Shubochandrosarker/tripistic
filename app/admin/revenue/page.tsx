import type { Metadata } from "next";
import { CalendarClock, CreditCard, DollarSign, TrendingUp, Users } from "lucide-react";
import { prisma } from "@/lib/db";
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
  const [subscriptions, succeededPayments, planRows, pendingChanges] = await Promise.all([
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
    prisma.plan.findMany({
      where: { isActive: true },
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { priceMonthly: "asc" },
    }),
    prisma.subscriptionChange.count({ where: { status: "scheduled" } }),
  ]);

  const activeSubscriptions = subscriptions.filter((item) => item.status === "active");
  const mrr = activeSubscriptions.reduce((sum, item) => sum + item.plan.priceMonthly, 0);
  const arr = mrr * 12;

  return (
    <>
      <PageHeader
        title="Revenue"
        description="Platform revenue, MRR, ARR, and plan mix across active subscriptions."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={DollarSign} label="MRR" value={formatMoney(mrr)} hint="Active subscription monthly value" />
        <MetricCard icon={TrendingUp} label="ARR" value={formatMoney(arr)} hint="MRR annualized" />
        <MetricCard icon={CreditCard} label="Succeeded payments" value={formatMoney(succeededPayments._sum.amount ?? 0)} hint={`${succeededPayments._count} guest payments`} />
        <MetricCard icon={Users} label="Active subscriptions" value={String(activeSubscriptions.length)} hint={`${subscriptions.length} total billing records shown`} />
        <MetricCard icon={CalendarClock} label="Scheduled changes" value={String(pendingChanges)} hint="Plan changes queued at renewal" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Plan Mix">
          <div className="space-y-3">
            {planRows.map((plan) => (
              <div key={plan.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-foreground">{plan.name}</span>
                  <span className="text-muted-foreground">{plan._count.subscriptions} subscriptions</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${Math.min(100, Math.max(4, plan._count.subscriptions * 12))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Revenue Notes" description="Stripe Connect and metered SaaS billing are ready to be layered on this model.">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>MRR/ARR is derived from active subscriptions and plan catalog prices.</li>
            <li>Guest payment volume is summed from succeeded payment rows.</li>
            <li>Refund-aware net revenue reporting should subtract refundedAmount in the next billing pass.</li>
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
