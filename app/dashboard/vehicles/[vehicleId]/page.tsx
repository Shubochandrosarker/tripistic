import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Calendar, DollarSign, TrendingUp } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageVehicles, canViewVehicles } from "@/lib/auth/permissions";
import { requireVehicle, computeVehicleDashboard } from "@/lib/vehicles/service";
import { VEHICLE_STATUS_LABELS, VEHICLE_TYPE_LABELS, type VehicleStatusValue, type VehicleTypeValue } from "@/lib/constants";
import { formatDateTimeInTz, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MaintenanceLogForm, FuelLogForm } from "@/components/vehicles/vehicle-log-forms";

type Params = { params: Promise<{ vehicleId: string }> };

export const metadata: Metadata = { title: "Vehicle" };

export default async function VehicleDetailPage({ params }: Params) {
  const { vehicleId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewVehicles(active.role)) notFound();

  const vehicle = await requireVehicle(active.workspace.id, vehicleId).catch(() => null);
  if (!vehicle) notFound();

  const dashboard = await computeVehicleDashboard(active.workspace.id, vehicleId);
  const manage = canManageVehicles(active.role);

  return (
    <>
      <PageHeader
        title={vehicle.name}
        description={`${VEHICLE_TYPE_LABELS[vehicle.type as VehicleTypeValue]} · Capacity ${vehicle.capacity}${vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ""}`}
        badge={<StatusBadge status={vehicle.status} label={VEHICLE_STATUS_LABELS[vehicle.status as VehicleStatusValue]} />}
      />

      {dashboard.maintenanceAlerts.length > 0 ? (
        <SectionCard title="Alerts">
          <ul className="space-y-2">
            {dashboard.maintenanceAlerts.map((alert, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                {alert}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Calendar} label="Upcoming trips" value={String(dashboard.upcomingTrips.length)} />
        <MetricCard
          icon={DollarSign}
          label="Fuel cost"
          value={formatMoney(dashboard.fuelCostCentsTotal, active.workspace.currency)}
        />
        <MetricCard
          icon={DollarSign}
          label="Maintenance cost"
          value={formatMoney(dashboard.maintenanceCostCentsTotal, active.workspace.currency)}
        />
        <MetricCard
          icon={TrendingUp}
          label="Profit"
          value={formatMoney(dashboard.profitCentsTotal, active.workspace.currency)}
          hint="Revenue from trips this vehicle served, minus fuel and maintenance"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Upcoming trips">
          {dashboard.upcomingTrips.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming assignments.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {dashboard.upcomingTrips.map((trip) => (
                <li key={trip.id} className="flex items-center justify-between py-2">
                  <span className="text-foreground">{trip.tourTitle}</span>
                  <time className="text-xs text-muted-foreground">
                    {formatDateTimeInTz(new Date(trip.startsAt), active.workspace.timezone)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {manage ? (
          <div className="space-y-4">
            <SectionCard title="Log maintenance">
              <MaintenanceLogForm workspaceId={active.workspace.id} vehicleId={vehicleId} />
            </SectionCard>
            <SectionCard title="Log fuel">
              <FuelLogForm workspaceId={active.workspace.id} vehicleId={vehicleId} />
            </SectionCard>
          </div>
        ) : null}
      </div>
    </>
  );
}
