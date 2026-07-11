import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { createBooking } from "@/lib/bookings/service";
import { GET as manifestRoute } from "@/app/api/workspaces/[id]/manifest/route";
import { addMember, createTestAvailability, createTestTour, createTestUser, createTestWorkspace, prisma } from "./helpers";

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

function bookingInput(workspaceId: string, tourId: string, availabilityId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    tourId,
    availabilityId,
    participantCount: 1,
    participants: [{ firstName: "Guest", lastName: "One" }],
    guestFirstName: "Guest",
    guestLastName: "One",
    guestEmail: `manifest-${randomUUID()}@example.com`,
    guestPhone: "+15551234567",
    addons: [],
    source: "public_direct" as const,
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("guide manifest — assigned-only visibility", () => {
  it("a member assigned to a departure sees it, with its confirmed booking's participants", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const guideUser = await createTestUser();
    const guideMember = await addMember(workspace.id, guideUser.id, "guide");
    const tour = await createTestTour(workspace.id, { basePrice: 0 });
    const availability = await createTestAvailability(tour, { startsAt: new Date(Date.now() + 2 * 86_400_000) });
    await prisma.availability.update({ where: { id: availability.id }, data: { guideId: guideMember.id } });

    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    expect(booking.status).toBe("confirmed");

    asUser(guideUser);
    const res = await manifestRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { departures: { id: string; bookings: { participants: unknown[] }[] }[] };
    expect(body.departures).toHaveLength(1);
    expect(body.departures[0].id).toBe(availability.id);
    expect(body.departures[0].bookings[0].participants).toHaveLength(1);
  });

  it("does not show a departure the member is not assigned to, even in the same workspace", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const guideUser = await createTestUser();
    await addMember(workspace.id, guideUser.id, "guide");
    const tour = await createTestTour(workspace.id, { basePrice: 0 });
    await createTestAvailability(tour, { startsAt: new Date(Date.now() + 2 * 86_400_000) }); // guideId left null

    asUser(guideUser);
    const res = await manifestRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await res.json()) as { departures: unknown[] };
    expect(body.departures).toHaveLength(0);
  });

  it("an unassigned member sees an empty manifest, not an error", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");

    asUser(owner);
    const res = await manifestRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { departures: unknown[] };
    expect(body.departures).toEqual([]);
  });

  it("cross-tenant: a member of workspace A gets 404 for workspace B's manifest route", async () => {
    const ownerA = await createTestUser();
    const workspaceA = await createTestWorkspace(ownerA.id);
    await addMember(workspaceA.id, ownerA.id, "workspace_owner");

    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    await addMember(workspaceB.id, ownerB.id, "workspace_owner");

    asUser(ownerA);
    const res = await manifestRoute(req("http://x/api"), { params: Promise.resolve({ id: workspaceB.id }) });
    expect(res.status).toBe(404);
  });

  it("surfaces per-participant waiver status when the tour requires a waiver", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const guideUser = await createTestUser();
    const guideMember = await addMember(workspace.id, guideUser.id, "guide");
    const tour = await createTestTour(workspace.id, { basePrice: 0, waiverRequired: true });
    const availability = await createTestAvailability(tour, { startsAt: new Date(Date.now() + 2 * 86_400_000) });
    await prisma.availability.update({ where: { id: availability.id }, data: { guideId: guideMember.id } });

    await createBooking(bookingInput(workspace.id, tour.id, availability.id));

    asUser(guideUser);
    const res = await manifestRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await res.json()) as { departures: { waiverRequired: boolean; bookings: { participants: { waiverSigned: boolean | null }[] }[] }[] };
    expect(body.departures[0].waiverRequired).toBe(true);
    expect(body.departures[0].bookings[0].participants[0].waiverSigned).toBe(false);
  });

  it("omits waiver status (null, not false) when the tour does not require a waiver", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const guideUser = await createTestUser();
    const guideMember = await addMember(workspace.id, guideUser.id, "guide");
    const tour = await createTestTour(workspace.id, { basePrice: 0, waiverRequired: false });
    const availability = await createTestAvailability(tour, { startsAt: new Date(Date.now() + 2 * 86_400_000) });
    await prisma.availability.update({ where: { id: availability.id }, data: { guideId: guideMember.id } });

    await createBooking(bookingInput(workspace.id, tour.id, availability.id));

    asUser(guideUser);
    const res = await manifestRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const body = (await res.json()) as { departures: { bookings: { participants: { waiverSigned: boolean | null }[] }[] }[] };
    expect(body.departures[0].bookings[0].participants[0].waiverSigned).toBeNull();
  });
});
