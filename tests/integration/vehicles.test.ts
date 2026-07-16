import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { GET as listVehiclesRoute, POST as createVehicleRoute } from "@/app/api/workspaces/[id]/vehicles/route";
import { DELETE as archiveVehicleRoute, PATCH as updateVehicleRoute } from "@/app/api/workspaces/[id]/vehicles/[vehicleId]/route";
import { POST as createMaintenanceRoute } from "@/app/api/workspaces/[id]/vehicles/[vehicleId]/maintenance/route";
import { POST as createFuelLogRoute } from "@/app/api/workspaces/[id]/vehicles/[vehicleId]/fuel-logs/route";
import { GET as vehicleDashboardRoute } from "@/app/api/workspaces/[id]/vehicles/[vehicleId]/dashboard/route";
import { POST as createAvailabilityRoute } from "@/app/api/workspaces/[id]/tours/[tourId]/availabilities/route";
import { addMember, createTestTour, createTestUser, createTestWorkspace } from "./helpers";

const mockRequireUserApi = requireUserApi as unknown as ReturnType<typeof vi.fn>;

function asUser(user: { id: string }) {
  mockRequireUserApi.mockResolvedValue(user);
}

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function futureDate(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

async function setup() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const staffUser = await createTestUser();
  await addMember(workspace.id, staffUser.id, "staff");
  const tour = await createTestTour(workspace.id);
  return { owner, workspace, staffUser, tour };
}

describe("vehicles", () => {
  it("owner creates a vehicle; staff can view but not manage", async () => {
    const { owner, workspace, staffUser } = await setup();
    asUser(owner);

    const created = await createVehicleRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Ford Transit", type: "van", capacity: 12 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(created.status).toBe(201);
    const { vehicle } = (await created.json()) as { vehicle: { id: string } };

    asUser(staffUser);
    const list = await listVehiclesRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(list.status).toBe(200);

    const denied = await updateVehicleRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ capacity: 20 }) }),
      { params: Promise.resolve({ id: workspace.id, vehicleId: vehicle.id }) },
    );
    expect(denied.status).toBe(403);
  });

  it("a retired vehicle cannot be assigned to a departure", async () => {
    const { owner, workspace, tour } = await setup();
    asUser(owner);

    const created = await createVehicleRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Old Van", type: "van", capacity: 8, status: "retired" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { vehicle } = (await created.json()) as { vehicle: { id: string } };

    const assign = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), vehicleId: vehicle.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    expect(assign.status).toBe(400);
  });

  it("tracks maintenance and fuel cost, rolled into the vehicle dashboard profit figure", async () => {
    const { owner, workspace, tour } = await setup();
    asUser(owner);

    const created = await createVehicleRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Sprinter", type: "van", capacity: 10 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { vehicle } = (await created.json()) as { vehicle: { id: string } };

    await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), vehicleId: vehicle.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );

    const maintenance = await createMaintenanceRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ type: "service", performedOn: "2026-07-01", costCents: 5000 }),
      }),
      { params: Promise.resolve({ id: workspace.id, vehicleId: vehicle.id }) },
    );
    expect(maintenance.status).toBe(201);

    const fuel = await createFuelLogRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ loggedOn: "2026-07-02", costCents: 3000 }) }),
      { params: Promise.resolve({ id: workspace.id, vehicleId: vehicle.id }) },
    );
    expect(fuel.status).toBe(201);

    const dashboard = await vehicleDashboardRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, vehicleId: vehicle.id }),
    });
    expect(dashboard.status).toBe(200);
    const body = (await dashboard.json()) as {
      upcomingTrips: unknown[];
      fuelCostCentsTotal: number;
      maintenanceCostCentsTotal: number;
      profitCentsTotal: number;
    };
    expect(body.upcomingTrips).toHaveLength(1);
    expect(body.fuelCostCentsTotal).toBe(3000);
    expect(body.maintenanceCostCentsTotal).toBe(5000);
    // No bookings yet, so revenue is 0 — profit is the negative of costs incurred.
    expect(body.profitCentsTotal).toBe(-8000);
  });

  it("archiving a vehicle excludes it from subsequent lists", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const created = await createVehicleRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ name: "Retiring Soon", capacity: 4 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { vehicle } = (await created.json()) as { vehicle: { id: string } };

    const archived = await archiveVehicleRoute(req("http://x/api", { method: "DELETE" }), {
      params: Promise.resolve({ id: workspace.id, vehicleId: vehicle.id }),
    });
    expect(archived.status).toBe(200);

    const list = await listVehiclesRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await list.json()) as { total: number };
    expect(body.total).toBe(0);
  });
});
