import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { GET as businessBrainRoute } from "@/app/api/workspaces/[id]/business-brain/route";
import { createBooking } from "@/lib/bookings/service";
import { addMember, createTestTour, createTestUser, createTestWorkspace, prisma } from "./helpers";

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

async function setup() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const staffUser = await createTestUser();
  await addMember(workspace.id, staffUser.id, "staff");
  return { owner, workspace, staffUser };
}

describe("business brain", () => {
  it("is owner/admin-only — staff is denied", async () => {
    const { owner, workspace, staffUser } = await setup();
    asUser(owner);
    const allowed = await businessBrainRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(allowed.status).toBe(200);

    asUser(staffUser);
    const denied = await businessBrainRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(denied.status).toBe(403);
  });

  it("reports hasEnoughData: false for a workspace with no bookings — no invented numbers", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const res = await businessBrainRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await res.json()) as { hasEnoughData: boolean; healthScore: number; growthScore: number };
    expect(body.hasEnoughData).toBe(false);
    expect(body.healthScore).toBe(0);
    expect(body.growthScore).toBe(0);
  });

  it("flags a low-occupancy weekday for a pricing suggestion once real booking history exists", async () => {
    const { owner, workspace } = await setup();
    const tour = await createTestTour(workspace.id, { capacity: 10 });
    asUser(owner);

    // createBooking() only accepts a future departure, so book a future slot
    // first and then backdate it to simulate a week of history — the
    // occupancy/revenue math only reads the stored rows, not "now".
    const futureStart = new Date(Date.now() + 3 * 86_400_000);
    const availability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt: futureStart,
        endsAt: new Date(futureStart.getTime() + tour.durationMinutes * 60_000),
        capacity: 10,
      },
    });

    await createBooking({
      workspaceId: workspace.id,
      tourId: tour.id,
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "Guest", lastName: "One" }],
      guestFirstName: "Guest",
      guestLastName: "One",
      guestEmail: "brain-guest@example.com",
      addons: [],
      source: "manual",
      status: "confirmed",
      requirePublicVisibility: false,
      idempotencyKey: crypto.randomUUID(),
    });

    const pastStart = new Date(Date.now() - 7 * 86_400_000);
    await prisma.availability.update({
      where: { id: availability.id },
      data: { startsAt: pastStart, endsAt: new Date(pastStart.getTime() + tour.durationMinutes * 60_000) },
    });
    await prisma.booking.updateMany({
      where: { workspaceId: workspace.id, availabilityId: availability.id },
      data: { departureStartsAt: pastStart },
    });

    const res = await businessBrainRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await res.json()) as {
      hasEnoughData: boolean;
      occupancyByWeekday: { weekday: number; avgOccupancyPct: number; departureCount: number }[];
      pricingSuggestions: string[];
    };
    expect(body.hasEnoughData).toBe(true);
    const bookedDay = body.occupancyByWeekday.find((d) => d.weekday === pastStart.getUTCDay());
    expect(bookedDay?.avgOccupancyPct).toBe(10);
    expect(body.pricingSuggestions.length).toBeGreaterThan(0);
  });
});
