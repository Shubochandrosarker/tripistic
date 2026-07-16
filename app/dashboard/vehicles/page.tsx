import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Car } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageVehicles, canViewVehicles } from "@/lib/auth/permissions";
import { listVehicles } from "@/lib/vehicles/service";
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, type VehicleStatusValue, type VehicleTypeValue } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TableShell, Td } from "@/components/ui/table-shell";
import { StatusBadge } from "@/components/ui/status-badge";
import { VehicleCreateForm } from "@/components/vehicles/vehicle-form";

export const metadata: Metadata = { title: "Fleet" };

export default async function VehiclesPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewVehicles(active.role)) notFound();

  const { vehicles, total } = await listVehicles(active.workspace.id, {
    search: undefined,
    page: 1,
    pageSize: 100,
  });
  const manage = canManageVehicles(active.role);

  return (
    <>
      <PageHeader
        title="Fleet"
        description="Vehicles, capacity, and document expiry — assign one to a departure from that tour's availability."
        actions={manage ? <VehicleCreateForm workspaceId={active.workspace.id} /> : null}
      />

      {total === 0 ? (
        <EmptyState icon={Car} title="No vehicles yet" description="Add a vehicle to start assigning it to departures and tracking maintenance." />
      ) : (
        <TableShell headers={["Name", "Type", "Plate", "Capacity", "Status"]}>
          {vehicles.map((v) => (
            <tr key={v.id} className="transition-colors hover:bg-muted/50">
              <Td>
                <Link href={`/dashboard/vehicles/${v.id}`} className="font-medium text-foreground hover:text-accent">
                  {v.name}
                </Link>
              </Td>
              <Td className="text-muted-foreground">{VEHICLE_TYPE_LABELS[v.type as VehicleTypeValue]}</Td>
              <Td className="text-muted-foreground">{v.licensePlate ?? "—"}</Td>
              <Td className="text-muted-foreground">{v.capacity}</Td>
              <Td>
                <StatusBadge status={v.status} label={VEHICLE_STATUS_LABELS[v.status as VehicleStatusValue]} />
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
