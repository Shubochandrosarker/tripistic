import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "Plans · Admin",
};

export default async function AdminPlansPage() {
  const plans = await prisma.plan.findMany({
    orderBy: { priceMonthly: "asc" },
    include: { _count: { select: { subscriptions: true } } },
  });

  return (
    <>
      <PageHeader
        title="Plans"
        description="SaaS plan catalog. Stripe billing and plan editing arrive in Phase 10 — plans are managed via seed data until then."
      />

      {plans.length === 0 ? (
        <SectionCard title="No plans found">
          <p className="text-sm text-muted-foreground">
            Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">npm run db:seed</code>{" "}
          to create the default plan catalog (Solo, Operator, Agency, Enterprise).
          </p>
        </SectionCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
            const limits =
              plan.limits && typeof plan.limits === "object" && !Array.isArray(plan.limits)
                ? (plan.limits as Record<string, number>)
                : {};
            return (
              <SectionCard
                key={plan.id}
                title={plan.name}
                actions={<StatusBadge status={plan.isActive ? "active" : "inactive"} />}
              >
                <p className="text-2xl font-semibold text-foreground">
                  {formatMoney(plan.priceMonthly, plan.currency)}
                  <span className="text-xs font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(plan.priceYearly, plan.currency)}/year ·{" "}
                  {plan._count.subscriptions} subscription
                  {plan._count.subscriptions === 1 ? "" : "s"}
                </p>
                <div className="mt-3 space-y-1 border-t border-border pt-3">
                  {Object.entries(limits).map(([key, value]) => (
                    <p key={key} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {key.replace(/_/g, " ")}:
                      </span>{" "}
                      {value === -1 ? "Unlimited" : value}
                    </p>
                  ))}
                </div>
                <ul className="mt-3 space-y-1 border-t border-border pt-3">
                  {features.slice(0, 6).map((feature) => (
                    <li key={feature} className="text-xs text-muted-foreground">
                      • {feature}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </div>
      )}
    </>
  );
}
