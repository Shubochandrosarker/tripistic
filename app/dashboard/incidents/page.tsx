import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageOperations, canViewOperations } from "@/lib/auth/permissions";
import { listIncidents } from "@/lib/dispatch/service";
import { INCIDENT_CATEGORY_LABELS, INCIDENT_SEVERITY_LABELS, type IncidentCategoryValue, type IncidentSeverityValue } from "@/lib/constants";
import { formatDateTimeInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { IncidentCreateForm, IncidentStatusSelect } from "@/components/dispatch/incident-form";

export const metadata: Metadata = { title: "Dispatch — Incidents" };

const SEVERITY_TONE: Record<string, "green" | "amber" | "orange" | "red"> = {
  low: "green",
  medium: "amber",
  high: "orange",
  critical: "red",
};

export default async function IncidentsPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewOperations(active.role)) notFound();

  const { incidents, total } = await listIncidents(active.workspace.id, { page: 1, pageSize: 100 });
  const manage = canManageOperations(active.role);

  return (
    <>
      <PageHeader
        title="Dispatch — Incidents"
        description="Report and track incidents — vehicle breakdowns, medical situations, weather, and more."
        actions={manage ? <IncidentCreateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState icon={ShieldAlert} title="No incidents reported" description="Nothing on record — that's a good thing." />
      ) : (
        <TableShell headers={["Reported", "Severity", "Category", "Departure", "Description", "Status"]}>
          {incidents.map((incident) => (
            <tr key={incident.id} className="transition-colors hover:bg-muted/50">
              <Td className="text-muted-foreground">{formatDateTimeInTz(incident.createdAt, active.workspace.timezone)}</Td>
              <Td>
                <StatusBadge
                  status={incident.severity}
                  label={INCIDENT_SEVERITY_LABELS[incident.severity as IncidentSeverityValue]}
                  tone={SEVERITY_TONE[incident.severity]}
                />
              </Td>
              <Td className="text-muted-foreground">{INCIDENT_CATEGORY_LABELS[incident.category as IncidentCategoryValue]}</Td>
              <Td className="text-muted-foreground">
                {incident.availability ? (
                  <Link href={`/dashboard/operations/${incident.availability.id}`} className="text-accent hover:underline">
                    {incident.availability.tour.title}
                  </Link>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="max-w-xs truncate text-foreground">{incident.description}</Td>
              <Td>
                {manage ? (
                  <IncidentStatusSelect workspaceId={active.workspace.id} incidentId={incident.id} status={incident.status} />
                ) : (
                  <StatusBadge status={incident.status} />
                )}
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
