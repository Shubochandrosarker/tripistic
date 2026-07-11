import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { unauthorized } from "@/lib/api";
import { createBooking } from "@/lib/bookings/service";
import { GET as listCustomersRoute } from "@/app/api/workspaces/[id]/customers/route";
import { GET as customerDetailRoute, PATCH as patchCustomerRoute } from "@/app/api/workspaces/[id]/customers/[customerId]/route";
import {
  addMember,
  createBookableFixture,
  createTestUser,
  createTestWorkspace,
  prisma,
} from "./helpers";

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
    guestEmail: "repeat-guest@example.com",
    addons: [],
    source: "public_direct" as const,
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("customer dedup and profile linkage", () => {
  it("a second booking from the same email in the same workspace updates the existing customer, not a duplicate", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, capacity: 10 } });

    const first = await createBooking(
      bookingInput(workspace.id, tour.id, availability.id, {
        guestFirstName: "Jane",
        guestLastName: "Doe",
        guestEmail: "Repeat-Guest@Example.com", // mixed case — dedup must normalize
      }),
    );
    const second = await createBooking(
      bookingInput(workspace.id, tour.id, availability.id, {
        guestFirstName: "Jane",
        guestLastName: "Doe-Smith", // name changed on the repeat booking
        guestEmail: "repeat-guest@example.com",
        idempotencyKey: randomUUID(),
      }),
    );

    expect(first.booking.customerId).not.toBeNull();
    expect(second.booking.customerId).toBe(first.booking.customerId);

    const customers = await prisma.customer.findMany({ where: { workspaceId: workspace.id, email: "repeat-guest@example.com" } });
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Jane Doe-Smith"); // refreshed by the second booking
  });

  it("the same email in a different workspace is a distinct customer — dedup is workspace-scoped", async () => {
    const fixtureA = await createBookableFixture({ tour: { basePrice: 0 } });
    const fixtureB = await createBookableFixture({ tour: { basePrice: 0 } });

    await createBooking(bookingInput(fixtureA.workspace.id, fixtureA.tour.id, fixtureA.availability.id));
    await createBooking(bookingInput(fixtureB.workspace.id, fixtureB.tour.id, fixtureB.availability.id));

    const customersA = await prisma.customer.count({ where: { workspaceId: fixtureA.workspace.id, email: "repeat-guest@example.com" } });
    const customersB = await prisma.customer.count({ where: { workspaceId: fixtureB.workspace.id, email: "repeat-guest@example.com" } });
    expect(customersA).toBe(1);
    expect(customersB).toBe(1);
  });

  it("does not overwrite operator-entered notes/tags/consent on a repeat booking", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0 } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));

    await prisma.customer.update({
      where: { id: booking.customerId! },
      data: { notes: "VIP — always upgrade", tags: ["vip"], consentStatus: "subscribed" },
    });

    await createBooking(bookingInput(workspace.id, tour.id, availability.id, { idempotencyKey: randomUUID() }));

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: booking.customerId! } });
    expect(customer.notes).toBe("VIP — always upgrade");
    expect(customer.tags).toEqual(["vip"]);
    expect(customer.consentStatus).toBe("subscribed");
  });
});

describe("internal customer routes — role enforcement and tenant isolation", () => {
  async function setup() {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const viewer = await createTestUser();
    await addMember(workspace.id, viewer.id, "viewer");

    const { tour, availability } = await createBookableFixture({ workspace: { slug: `cust-${randomUUID().slice(0, 8)}` }, tour: { basePrice: 0 } });
    // Reuse the same workspace for the booking instead of the fixture's own — simplest is to just create the booking directly against our workspace.
    const ownWorkspaceTour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Owned Tour",
        slug: `owned-${randomUUID().slice(0, 8)}`,
        durationMinutes: 60,
        capacity: 5,
        basePrice: 0,
        status: "active",
        visibility: "public",
      },
    });
    const ownWorkspaceAvailability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: ownWorkspaceTour.id,
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000 + 3_600_000),
        capacity: 5,
      },
    });
    const { booking } = await createBooking(
      bookingInput(workspace.id, ownWorkspaceTour.id, ownWorkspaceAvailability.id, { guestEmail: `role-test-${randomUUID()}@example.com` }),
    );
    void tour;
    void availability;

    return { workspace, owner, viewer, customerId: booking.customerId! };
  }

  it("viewer can list and view a customer but email is redacted", async () => {
    const { workspace, viewer } = await setup();
    asUser(viewer);

    const list = await listCustomersRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { customers: { email: string | null }[] };
    expect(listBody.customers[0].email).toBeNull();
  });

  it("viewer cannot edit a customer (403), owner can", async () => {
    const { workspace, owner, viewer, customerId } = await setup();

    asUser(viewer);
    const denied = await patchCustomerRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ notes: "nope" }) }),
      { params: Promise.resolve({ id: workspace.id, customerId }) },
    );
    expect(denied.status).toBe(403);

    asUser(owner);
    const allowed = await patchCustomerRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ tags: ["repeat", "vip"], consentStatus: "unsubscribed" }) }),
      { params: Promise.resolve({ id: workspace.id, customerId }) },
    );
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { customer: { tags: string[]; consentStatus: string } };
    expect(body.customer.tags).toEqual(["repeat", "vip"]);
    expect(body.customer.consentStatus).toBe("unsubscribed");
  });

  it("a customer from workspace A is unreachable through workspace B's routes", async () => {
    const { customerId } = await setup();
    const otherOwner = await createTestUser();
    const otherWorkspace = await createTestWorkspace(otherOwner.id);
    await addMember(otherWorkspace.id, otherOwner.id, "workspace_owner");

    asUser(otherOwner);
    const res = await customerDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: otherWorkspace.id, customerId }),
    });
    expect(res.status).toBe(404);
  });

  it("unauthenticated requests are rejected with 401", async () => {
    const { workspace } = await setup();
    mockRequireUserApi.mockRejectedValue(unauthorized());
    const res = await listCustomersRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(401);
  });
});
