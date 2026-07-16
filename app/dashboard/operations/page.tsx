import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Radio } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageOperations, canViewOperations } from "@/lib/auth/permissions";
import { listDeparturesForDate, dayBoundsInTz } from "@/lib/operations/service";
import { hasActiveEmergency } from "@/lib/dispatch/service";
import { OPS_STATUS_LABELS, type OpsStatusValue } from "@/lib/constants";
import { formatDateTimeInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { OpsStatusControl } from "@/components/operations/ops-status-control";

export const metadata: Metadata = { title: "Operations" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OperationsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewOperations(active.role)) notFound();

  const raw = await searchParams;
  const dateParam = Array.isArray(raw.date) ? raw.date[0] : raw.date;
  const dateKey = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  const { dayStart, dayEnd } = dayBoundsInTz(dateKey, active.workspace.timezone);
  const [departures, emergency] = await Promise.all([
    listDeparturesForDate(active.workspace.id, dayStart, dayEnd),
    hasActiveEmergency(active.workspace.id),
  ]);
  const manage = canManageOperations(active.role);

  return (
    <>
      <PageHeader
        title="Operations Center"
        description="Live status for every departure today — check-ins, boarding, delays, and completion."
      />

      {emergency ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="font-medium">Emergency mode:</span> an open critical incident needs attention.
          <Link href="/dashboard/incidents" className="ml-auto font-medium underline">
            View incidents
          </Link>
        </div>
      ) : null}

      <form method="GET" className="flex items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div>
          <label htmlFor="date" className="mb-1 block text-xs font-medium text-muted-foreground">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={dateKey}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          />
        </div>
        <button type="submit" className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
          View
        </button>
      </form>

      {departures.length === 0 ? (
        <EmptyState icon={Radio} title="No departures on this day" description="Nothing scheduled — check another date or your tour calendar." />
      ) : (
        <TableShell headers={["Time", "Tour", "Party", "Booked / Checked in", "Status", ...(manage ? ["Actions"] : [])]}>
          {departures.map((d) => (
            <tr key={d.id} className="transition-colors hover:bg-muted/50">
              <Td>
                <Link href={`/dashboard/operations/${d.id}`} className="font-medium text-foreground hover:text-accent">
                  {formatDateTimeInTz(d.startsAt, active.workspace.timezone)}
                </Link>
              </Td>
              <Td className="text-muted-foreground">{d.tour.title}</Td>
              <Td className="text-muted-foreground">
                {d.guide ? <span className="block">Guide: {d.guide.user.name}</span> : null}
                {d.driver ? <span className="block">Driver: {d.driver.user.name}</span> : null}
                {d.vehicle ? <span className="block">Vehicle: {d.vehicle.name}</span> : null}
                {!d.guide && !d.driver && !d.vehicle ? "—" : null}
              </Td>
              <Td className="text-muted-foreground">
                {d.bookedCount}/{d.capacity} · {d.bookings.length} checked in
              </Td>
              <Td>
                <StatusBadge status={d.opsStatus} label={OPS_STATUS_LABELS[d.opsStatus as OpsStatusValue]} />
                {d.delayMinutes ? <span className="ml-1 text-xs text-muted-foreground">+{d.delayMinutes}m</span> : null}
              </Td>
              {manage ? (
                <Td>
                  <OpsStatusControl workspaceId={active.workspace.id} availabilityId={d.id} status={d.opsStatus as OpsStatusValue} />
                </Td>
              ) : null}
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
