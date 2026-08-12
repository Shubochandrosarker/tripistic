import type { Metadata } from "next";
import { CircleDollarSign, KeyRound, ShieldAlert, Wallet } from "lucide-react";

import { X402_ROUTES, x402Readiness } from "@/lib/x402/config";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";

export const metadata: Metadata = { title: "x402 · Admin" };

/**
 * Payer addresses are truncated.
 *
 * A wallet address is a pseudonymous identifier that links every payment the
 * same agent ever made, here and on any other service. The middle is dropped so
 * a support screenshot does not become a correlation key; the full value is in
 * the row for anyone who needs it deliberately.
 */
function shortenAddress(value: string | null): string {
  if (!value) return "—";
  return value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export default async function AdminX402Page() {
  const readiness = x402Readiness();

  const [payments, byStatus, byRoute, activeGrants] = await Promise.all([
    prisma.x402Payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { workspace: { select: { name: true } } },
    }),
    prisma.x402Payment.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.x402Payment.groupBy({
      by: ["route"],
      where: { status: "verified" },
      _count: { _all: true },
    }),
    prisma.x402AccessGrant.count({ where: { expiresAt: { gt: new Date() } } }),
  ]);

  const counted = (status: string) =>
    byStatus.find((row) => row.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="x402 machine payments"
        description="Agent-facing paid API routes. Entirely separate from Stripe: no booking, refund or payout path touches this."
        badge={<StatusBadge status={readiness.ready ? "active" : "disabled"} />}
      />

      {!readiness.ready ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="font-medium">x402 is not serving requests.</p>
          <p className="mt-0.5">{readiness.reason}</p>
          <p className="mt-1.5 text-xs">
            While disabled, the protected routes answer 404 rather than advertising a price — an
            experimental rail that is switched off should look absent, not dormant.
          </p>
        </div>
      ) : readiness.config.isMainnet ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <p className="font-medium">Live network: {readiness.config.network}</p>
          <p className="mt-0.5">
            This deployment accepts real funds. X402_ALLOW_MAINNET is set to true.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={CircleDollarSign}
          label="Verified payments"
          value={String(counted("verified"))}
          hint="Settlements credited"
        />
        <MetricCard
          icon={ShieldAlert}
          label="Rejected"
          value={String(counted("rejected"))}
          hint={`${counted("pending")} still pending`}
        />
        <MetricCard icon={KeyRound} label="Active grants" value={String(activeGrants)} hint="Unexpired access tokens" />
        <MetricCard
          icon={Wallet}
          label="Network"
          value={readiness.config.network}
          hint={readiness.config.isMainnet ? "Mainnet — real funds" : "Testnet"}
        />
      </div>

      <SectionCard
        title="Price list"
        description="An explicit allow-list. A prefix match would silently start charging for any route added underneath it."
      >
        <TableShell headers={["Route", "Price", "Access window", "Calls per payment"]} isEmpty={false}>
          {X402_ROUTES.map((route) => (
            <tr key={route.path}>
              <Td className="font-mono text-xs text-foreground">{route.path}</Td>
              <Td className="text-muted-foreground">
                {route.amount} {route.currency}
              </Td>
              <Td className="text-muted-foreground">{route.ttlSeconds / 60} min</Td>
              <Td className="text-muted-foreground">{route.maxUses}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>

      <SectionCard title="Verified payments by route">
        <TableShell
          headers={["Route", "Payments"]}
          isEmpty={byRoute.length === 0}
          emptyMessage="No verified payments yet."
        >
          {byRoute.map((row) => (
            <tr key={row.route}>
              <Td className="font-mono text-xs text-foreground">{row.route}</Td>
              <Td className="text-muted-foreground">{row._count._all}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>

      <SectionCard title="Recent payments">
        <TableShell
          headers={["Status", "Route", "Amount", "Network", "Payer", "Workspace", "When"]}
          isEmpty={payments.length === 0}
          emptyMessage="No x402 payments recorded."
        >
          {payments.map((payment) => (
            <tr key={payment.id}>
              <Td>
                <StatusBadge status={payment.status} />
              </Td>
              <Td className="font-mono text-xs text-muted-foreground">{payment.route}</Td>
              <Td className="text-muted-foreground">
                {payment.amount} {payment.currency}
              </Td>
              <Td className="text-muted-foreground">{payment.network}</Td>
              <Td className="font-mono text-xs text-muted-foreground">
                {shortenAddress(payment.payer)}
              </Td>
              <Td className="text-muted-foreground">{payment.workspace?.name ?? "Unaffiliated agent"}</Td>
              <Td className="text-muted-foreground">{formatDateTime(payment.createdAt)}</Td>
            </tr>
          ))}
        </TableShell>
      </SectionCard>
    </>
  );
}
