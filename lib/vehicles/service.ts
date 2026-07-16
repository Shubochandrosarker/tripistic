import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/api";
import { VEHICLE_EXPIRY_WARNING_DAYS } from "@/lib/constants";
import type { VehicleListQuery } from "./types";

export async function requireVehicle(workspaceId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, workspaceId, deletedAt: null } });
  if (!vehicle) throw notFound("Vehicle not found");
  return vehicle;
}

/** Eligibility check for `Availability.vehicleId` — must exist, belong to this workspace, and not be retired. */
export async function requireActiveVehicle(workspaceId: string, vehicleId: string) {
  const vehicle = await prisma.vehicle.findFirst({ where: { id: vehicleId, workspaceId, deletedAt: null } });
  if (!vehicle) throw badRequest("That vehicle was not found in this workspace.");
  if (vehicle.status === "retired") throw badRequest("A retired vehicle cannot be assigned to a departure.");
  return vehicle;
}

export function buildVehicleListQuery(workspaceId: string, query: VehicleListQuery) {
  const where: Prisma.VehicleWhereInput = { workspaceId, deletedAt: null };
  if (query.status) where.status = query.status;
  if (query.search) {
    const search = query.search.trim();
    if (search.length > 0) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { licensePlate: { contains: search, mode: "insensitive" } },
      ];
    }
  }
  return {
    where,
    orderBy: { name: "asc" as const },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  };
}

export async function listVehicles(workspaceId: string, query: VehicleListQuery) {
  const { where, orderBy, skip, take } = buildVehicleListQuery(workspaceId, query);
  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({ where, orderBy, skip, take }),
    prisma.vehicle.count({ where }),
  ]);
  return { vehicles, total };
}

export type VehicleInput = {
  name: string;
  type?: "car" | "van" | "minibus" | "bus" | "boat" | "other";
  licensePlate?: string;
  capacity: number;
  status?: "active" | "maintenance" | "retired";
  odometer?: number;
  fuelType?: string;
  insuranceExpiresOn?: Date;
  registrationExpiresOn?: Date;
  notes?: string;
};

export async function createVehicle(workspaceId: string, input: VehicleInput) {
  return prisma.vehicle.create({
    data: {
      workspaceId,
      name: input.name,
      type: input.type ?? "car",
      licensePlate: input.licensePlate ?? null,
      capacity: input.capacity,
      status: input.status ?? "active",
      odometer: input.odometer ?? null,
      fuelType: input.fuelType ?? null,
      insuranceExpiresOn: input.insuranceExpiresOn ?? null,
      registrationExpiresOn: input.registrationExpiresOn ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateVehicle(workspaceId: string, vehicleId: string, input: Partial<VehicleInput>) {
  await requireVehicle(workspaceId, vehicleId);
  return prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.licensePlate !== undefined ? { licensePlate: input.licensePlate } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.odometer !== undefined ? { odometer: input.odometer } : {}),
      ...(input.fuelType !== undefined ? { fuelType: input.fuelType } : {}),
      ...(input.insuranceExpiresOn !== undefined ? { insuranceExpiresOn: input.insuranceExpiresOn } : {}),
      ...(input.registrationExpiresOn !== undefined ? { registrationExpiresOn: input.registrationExpiresOn } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

/** Soft delete only — a Vehicle is never hard-deleted (Availability.vehicle composite FK references it with onDelete: Restrict). */
export async function archiveVehicle(workspaceId: string, vehicleId: string) {
  await requireVehicle(workspaceId, vehicleId);
  return prisma.vehicle.update({ where: { id: vehicleId }, data: { status: "retired", deletedAt: new Date() } });
}

export async function createMaintenanceRecord(
  workspaceId: string,
  vehicleId: string,
  input: {
    type?: "service" | "repair" | "inspection";
    performedOn: Date;
    odometer?: number;
    costCents?: number;
    vendorName?: string;
    notes?: string;
    nextDueOn?: Date;
  },
) {
  await requireVehicle(workspaceId, vehicleId);
  return prisma.vehicleMaintenanceRecord.create({
    data: {
      workspaceId,
      vehicleId,
      type: input.type ?? "service",
      performedOn: input.performedOn,
      odometer: input.odometer ?? null,
      costCents: input.costCents ?? null,
      vendorName: input.vendorName ?? null,
      notes: input.notes ?? null,
      nextDueOn: input.nextDueOn ?? null,
    },
  });
}

export async function createFuelLog(
  workspaceId: string,
  vehicleId: string,
  input: { loggedOn: Date; costCents: number; odometer?: number; notes?: string },
) {
  await requireVehicle(workspaceId, vehicleId);
  return prisma.vehicleFuelLog.create({
    data: {
      workspaceId,
      vehicleId,
      loggedOn: input.loggedOn,
      costCents: input.costCents,
      odometer: input.odometer ?? null,
      notes: input.notes ?? null,
    },
  });
}

export type VehicleDashboard = {
  upcomingTrips: { id: string; startsAt: string; tourTitle: string }[];
  maintenanceAlerts: string[];
  fuelCostCentsTotal: number;
  maintenanceCostCentsTotal: number;
  revenueCentsTotal: number;
  profitCentsTotal: number;
};

/** Upcoming assignments, expiry/maintenance alerts, and a simple profit rollup for one vehicle. */
export async function computeVehicleDashboard(workspaceId: string, vehicleId: string): Promise<VehicleDashboard> {
  const vehicle = await requireVehicle(workspaceId, vehicleId);
  const now = new Date();
  const warningCutoff = new Date(now.getTime() + VEHICLE_EXPIRY_WARNING_DAYS * 86_400_000);

  const [upcoming, fuelLogs, maintenanceRecords, bookings] = await Promise.all([
    prisma.availability.findMany({
      where: { workspaceId, vehicleId, startsAt: { gt: now }, status: "scheduled" },
      orderBy: { startsAt: "asc" },
      take: 10,
      include: { tour: { select: { title: true } } },
    }),
    prisma.vehicleFuelLog.findMany({ where: { workspaceId, vehicleId }, select: { costCents: true } }),
    prisma.vehicleMaintenanceRecord.findMany({ where: { workspaceId, vehicleId }, select: { costCents: true, nextDueOn: true } }),
    prisma.booking.findMany({
      where: {
        workspaceId,
        availability: { vehicleId },
        status: { in: ["confirmed", "completed"] },
      },
      select: { totalAmount: true },
    }),
  ]);

  const alerts: string[] = [];
  if (vehicle.insuranceExpiresOn && vehicle.insuranceExpiresOn <= warningCutoff) {
    alerts.push(
      vehicle.insuranceExpiresOn < now
        ? "Insurance has expired."
        : `Insurance expires ${vehicle.insuranceExpiresOn.toISOString().slice(0, 10)}.`,
    );
  }
  if (vehicle.registrationExpiresOn && vehicle.registrationExpiresOn <= warningCutoff) {
    alerts.push(
      vehicle.registrationExpiresOn < now
        ? "Registration has expired."
        : `Registration expires ${vehicle.registrationExpiresOn.toISOString().slice(0, 10)}.`,
    );
  }
  for (const record of maintenanceRecords) {
    if (record.nextDueOn && record.nextDueOn <= warningCutoff) {
      alerts.push(
        record.nextDueOn < now
          ? "A scheduled maintenance item is overdue."
          : `Maintenance due ${record.nextDueOn.toISOString().slice(0, 10)}.`,
      );
    }
  }

  const fuelCostCentsTotal = fuelLogs.reduce((sum, f) => sum + f.costCents, 0);
  const maintenanceCostCentsTotal = maintenanceRecords.reduce((sum, m) => sum + (m.costCents ?? 0), 0);
  const revenueCentsTotal = bookings.reduce((sum, b) => sum + b.totalAmount, 0);

  return {
    upcomingTrips: upcoming.map((a) => ({ id: a.id, startsAt: a.startsAt.toISOString(), tourTitle: a.tour.title })),
    maintenanceAlerts: alerts,
    fuelCostCentsTotal,
    maintenanceCostCentsTotal,
    revenueCentsTotal,
    profitCentsTotal: revenueCentsTotal - fuelCostCentsTotal - maintenanceCostCentsTotal,
  };
}
