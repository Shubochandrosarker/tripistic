import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, CreditCard, DollarSign, Landmark, ShieldCheck } from "lucide-react";
import { canManageBilling, canManageBookings, canManageWorkspace } from "@/lib/auth/permissions";
import { requireUserPage } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { supportedConnectCountriesFromEnv } from "@/lib/payments/connect";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { formatDate, formatMoney } from "@/lib/utils";
import { ConnectActions } from "@/components/payments/connect-actions";
import { PayoutBalanceCard } from "@/components/payments/payout-balance-card";
import { RefundPaymentButton } from "@/components/payments/refund-payment-button";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = {
  title: "Payments & Payouts",
};

function listRequirement(value: unknown, key: string): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const item = (value as Record<string, unknown>)[key];
  return Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === "string") : [];
}

export default async function PaymentsPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const canManage = canManageBilling(active.role);
  const canRefund = canManageWorkspace(active.role);
  const canViewPayments = canManageBookings(active.role) || canManage;
  if (!canViewPayments) redirect("/dashboard");

  const [paymentAccount, payments, refunds, disputes, totals] = await Promise.all([
    prisma.workspacePaymentAccount.findUnique({ where: { workspaceId: active.workspace.id } }),
    prisma.payment.findMany({
      where: { workspaceId: active.workspace.id },
      include: { booking: { select: { reference: true, guestFirstName: true, guestLastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.paymentRefund.findMany({
      where: { workspaceId: active.workspace.id },
      include: { payment: { select: { booking: { select: { reference: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.paymentDispute.findMany({
      where: { workspaceId: active.workspace.id },
      include: { payment: { select: { booking: { select: { reference: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.payment.aggregate({
      where: { workspaceId: active.workspace.id, status: "succeeded" },
      _sum: { amount: true, platformFeeAmount: true },
      _count: true,
    }),
  ]);

  const chargeReady = Boolean(paymentAccount?.chargesEnabled && paymentAccount.payoutsEnabled && paymentAccount.status === "enabled");
  const currentlyDue = listRequirement(paymentAccount?.requirements, "currentlyDue");
  const pastDue = listRequirement(paymentAccount?.requirements, "pastDue");
  const supportedCountries = supportedConnectCountriesFromEnv().join(", ");

  return (
    <>
      <PageHeader
        title="Payments & Payouts"
        description="Connect Stripe, route traveler payments to your account, and monitor payout readiness."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={DollarSign} label="Gross paid" value={formatMoney(totals._sum.amount ?? 0, active.workspace.currency)} hint={`${totals._count} succeeded payments`} />
        <MetricCard icon={CreditCard} label="Tripistic fee" value={formatMoney(totals._sum.platformFeeAmount ?? 0, active.workspace.currency)} hint="Explicit platform fee snapshot" />
        <MetricCard icon={Landmark} label="Charges" value={paymentAccount?.chargesEnabled ? "Enabled" : "Not ready"} hint="Stripe card payment capability" />
        <MetricCard icon={ShieldCheck} label="Payouts" value={paymentAccount?.payoutsEnabled ? "Enabled" : "Not ready"} hint="Stripe transfer capability" />
      </div>

      <SectionCard
        title="Stripe Connect"
        description="Tripistic uses Stripe Express destination charges. Traveler funds route to your connected account when Stripe marks charges and payouts ready."
        actions={<ConnectActions canManage={canManage} hasAccount={Boolean(paymentAccount)} />}
      >
        {paymentAccount ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Status</p>
              <StatusBadge status={paymentAccount.status} label={chargeReady ? "ready" : paymentAccount.status} tone={chargeReady ? "green" : undefined} />
              <p className="pt-2 text-xs text-muted-foreground">
                Last synced: {paymentAccount.lastSyncedAt ? formatDate(paymentAccount.lastSyncedAt) : "Not synced"}
              </p>
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Stripe account</dt>
                <dd className="font-mono text-xs text-foreground">{paymentAccount.providerAccountId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Country / currency</dt>
                <dd className="text-foreground">
                  {paymentAccount.country ?? "Unknown"} / {paymentAccount.defaultCurrency ?? active.workspace.currency}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Supported countries</dt>
                <dd className="text-foreground">{supportedCountries}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Platform fee</dt>
                <dd className="text-foreground">{paymentAccount.platformFeeBps / 100}%</dd>
              </div>
            </dl>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Requirements</p>
              {currentlyDue.length === 0 && pastDue.length === 0 ? (
                <p className="text-foreground">No currently due requirements.</p>
              ) : (
                <ul className="space-y-1 text-muted-foreground">
                  {[...pastDue, ...currentlyDue].slice(0, 6).map((item) => (
                    <li key={item} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No Stripe account is connected yet. Paid public bookings are blocked until onboarding is complete.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Payout balance"
        description="Live available and pending balances are read directly from the connected Stripe account."
      >
        <PayoutBalanceCard canManage={canManage} hasAccount={Boolean(paymentAccount)} />
      </SectionCard>

      <TableShell
        headers={["Booking", "Status", "Amount", "Fee", "Connected Account", "Updated", "Refund"]}
        isEmpty={payments.length === 0}
        emptyMessage="No payment attempts yet."
      >
        {payments.map((payment) => {
          const refundableAmount = Math.max(0, payment.amount - (payment.refundedAmount ?? 0));
          return (
            <tr key={payment.id}>
              <Td>
                <span className="font-medium">{payment.booking.reference}</span>
                <span className="block text-xs text-muted-foreground">
                  {payment.booking.guestFirstName} {payment.booking.guestLastName}
                </span>
              </Td>
              <Td>
                <StatusBadge status={payment.status} />
              </Td>
              <Td className="text-muted-foreground">{formatMoney(payment.amount, payment.currency)}</Td>
              <Td className="text-muted-foreground">{formatMoney(payment.platformFeeAmount, payment.currency)}</Td>
              <Td className="font-mono text-xs text-muted-foreground">{payment.providerConnectedAccountId ?? "Not routed"}</Td>
              <Td className="text-muted-foreground">{formatDate(payment.updatedAt)}</Td>
              <Td>
                {["succeeded", "partially_refunded"].includes(payment.status) ? (
                  <RefundPaymentButton
                    workspaceId={active.workspace.id}
                    paymentId={payment.id}
                    currency={payment.currency}
                    refundableAmount={refundableAmount}
                    canManage={canRefund}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Unavailable</span>
                )}
              </Td>
            </tr>
          );
        })}
      </TableShell>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Recent refunds</h2>
          <TableShell
            headers={["Booking", "Status", "Amount", "Reason"]}
            isEmpty={refunds.length === 0}
            emptyMessage="No refunds recorded."
          >
            {refunds.map((refund) => (
              <tr key={refund.id}>
                <Td>{refund.payment.booking.reference}</Td>
                <Td>
                  <StatusBadge status={refund.status} />
                </Td>
                <Td className="text-muted-foreground">{formatMoney(refund.amount, refund.currency)}</Td>
                <Td className="text-muted-foreground">{refund.reason ?? "Not provided"}</Td>
              </tr>
            ))}
          </TableShell>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Disputes</h2>
          <TableShell
            headers={["Booking", "Status", "Amount", "Reason"]}
            isEmpty={disputes.length === 0}
            emptyMessage="No disputes recorded."
          >
            {disputes.map((dispute) => (
              <tr key={dispute.id}>
                <Td>{dispute.payment?.booking.reference ?? "Unmapped"}</Td>
                <Td>
                  <StatusBadge status={dispute.status} />
                </Td>
                <Td className="text-muted-foreground">{formatMoney(dispute.amount, dispute.currency)}</Td>
                <Td className="text-muted-foreground">{dispute.reason ?? "Not provided"}</Td>
              </tr>
            ))}
          </TableShell>
        </section>
      </div>
    </>
  );
}
