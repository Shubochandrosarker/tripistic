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
import { GET as publicToursRoute } from "@/app/api/public/[workspaceSlug]/tours/route";
import { GET as publicTourDetailRoute } from "@/app/api/public/[workspaceSlug]/tours/[tourSlug]/route";
import { GET as publicAvailabilityRoute } from "@/app/api/public/[workspaceSlug]/tours/[tourSlug]/availability/route";
import { POST as publicCreateBookingRoute } from "@/app/api/public/[workspaceSlug]/bookings/route";
import { GET as publicConfirmationRoute } from "@/app/api/public/bookings/[publicToken]/route";
import { GET as listBookingsRoute, POST as createManualBookingRoute } from "@/app/api/workspaces/[id]/bookings/route";
import { GET as bookingDetailRoute, PATCH as patchBookingRoute } from "@/app/api/workspaces/[id]/bookings/[bookingId]/route";
import { POST as statusRoute } from "@/app/api/workspaces/[id]/bookings/[bookingId]/status/route";
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

function asUnauthenticated() {
  mockRequireUserApi.mockRejectedValue(unauthorized());
}

function req(url: string, init?: RequestInit) {
  return new Request(url, init);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public API routes", () => {
  it("tours list only returns active/public tours, 404 for a hidden workspace", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id, { slug: `pub-${randomUUID().slice(0, 8)}` });
    await addMember(workspace.id, owner.id);
    const publicTour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Visible Tour",
        slug: "visible-tour",
        durationMinutes: 60,
        capacity: 5,
        basePrice: 1000,
        status: "active",
        visibility: "public",
      },
    });
    await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Draft Tour",
        slug: "draft-tour",
        durationMinutes: 60,
        capacity: 5,
        basePrice: 1000,
        status: "draft",
        visibility: "public",
      },
    });
    await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Private Tour",
        slug: "private-tour",
        durationMinutes: 60,
        capacity: 5,
        basePrice: 1000,
        status: "active",
        visibility: "private",
      },
    });

    const res = await publicToursRoute(req("http://x/api/public/x/tours"), {
      params: Promise.resolve({ workspaceSlug: workspace.slug }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tours: { slug: string }[] };
    expect(body.tours.map((t) => t.slug)).toEqual([publicTour.slug]);

    const hidden = await publicToursRoute(req("http://x/api/public/x/tours"), {
      params: Promise.resolve({ workspaceSlug: "does-not-exist" }),
    });
    expect(hidden.status).toBe(404);
  });

  it("tour detail 404s for a private tour and succeeds for a public one", async () => {
    const { workspace, tour } = await createBookableFixture();
    const ok = await publicTourDetailRoute(req("http://x"), {
      params: Promise.resolve({ workspaceSlug: workspace.slug, tourSlug: tour.slug }),
    });
    expect(ok.status).toBe(200);

    const privateTour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Hidden",
        slug: "hidden-tour",
        durationMinutes: 60,
        capacity: 5,
        basePrice: 1000,
        status: "active",
        visibility: "private",
      },
    });
    const hidden = await publicTourDetailRoute(req("http://x"), {
      params: Promise.resolve({ workspaceSlug: workspace.slug, tourSlug: privateTour.slug }),
    });
    expect(hidden.status).toBe(404);
  });

  it("availability route never returns bookedCount and rejects invalid query ranges with 400", async () => {
    const { workspace, tour } = await createBookableFixture({ tour: { capacity: 4 } });

    const ok = await publicAvailabilityRoute(req("http://x/api?partySize=2"), {
      params: Promise.resolve({ workspaceSlug: workspace.slug, tourSlug: tour.slug }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { departures: Record<string, unknown>[] };
    expect(body.departures.length).toBeGreaterThan(0);
    expect(body.departures[0]).not.toHaveProperty("bookedCount");
    expect(body.departures[0]).toHaveProperty("remainingCapacity");

    const bad = await publicAvailabilityRoute(
      req("http://x/api?from=2026-07-15T00:00:00Z&to=2020-01-01T00:00:00Z"),
      { params: Promise.resolve({ workspaceSlug: workspace.slug, tourSlug: tour.slug }) },
    );
    expect(bad.status).toBe(400);
  });

  it("public booking creation succeeds, rejects the honeypot, and replays idempotently", async () => {
    // basePrice: 0 — this test is about the route's honeypot/idempotency
    // behavior, not payment; a non-zero total would route the booking
    // through a real Stripe Checkout Session call. The payment-gated path
    // is covered separately with a mocked Stripe client (payment-flow.test.ts).
    const { workspace, availability } = await createBookableFixture({ tour: { capacity: 5, basePrice: 0 } });
    const idempotencyKey = randomUUID();
    const payload = {
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "Pat", lastName: "Guest" }],
      guestFirstName: "Pat",
      guestLastName: "Guest",
      guestEmail: "pat@example.com",
      addons: [],
      termsAccepted: true,
      idempotencyKey,
    };

    const created = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { booking: { reference: string } };
    expect(createdBody.booking.reference).toMatch(/^[A-Z0-9]{8}$/);

    const replay = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    expect(replay.status).toBe(200);

    const honeypot = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, {
        method: "POST",
        body: JSON.stringify({ ...payload, idempotencyKey: randomUUID(), website: "http://spam.example" }),
      }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    expect(honeypot.status).toBe(400);

    const finalAvailability = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(finalAvailability.bookedCount).toBe(1); // honeypot + replay did not reserve extra seats
  });

  it("public confirmation lookup only returns that booking's own data, 404 for a bogus token", async () => {
    // basePrice: 0 — avoids a real Stripe Checkout Session call; see the
    // comment on the honeypot/idempotency test above.
    const { workspace, availability } = await createBookableFixture({ tour: { basePrice: 0 } });
    const payload = {
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "Pat", lastName: "Guest" }],
      guestFirstName: "Pat",
      guestLastName: "Guest",
      guestEmail: "confirm@example.com",
      addons: [],
      termsAccepted: true,
      idempotencyKey: randomUUID(),
    };
    const created = await publicCreateBookingRoute(
      req(`http://x/api/public/${workspace.slug}/bookings`, { method: "POST", body: JSON.stringify(payload) }),
      { params: Promise.resolve({ workspaceSlug: workspace.slug }) },
    );
    const { booking } = (await created.json()) as { booking: { reference: string } };

    const found = await publicConfirmationRoute(req("http://x"), {
      params: Promise.resolve({ publicToken: (await prisma.booking.findFirstOrThrow({ where: { reference: booking.reference } })).publicToken }),
    });
    expect(found.status).toBe(200);
    const foundBody = await found.json();
    expect(foundBody.booking.reference).toBe(booking.reference);
    expect(foundBody.booking).not.toHaveProperty("guestEmail");
    expect(foundBody.booking).not.toHaveProperty("operatorNotes");

    const notFound = await publicConfirmationRoute(req("http://x"), {
      params: Promise.resolve({ publicToken: "not-a-real-token-at-all" }),
    });
    expect(notFound.status).toBe(404);
  });
});

describe("internal booking API routes — role enforcement", () => {
  async function setup(participantCount = 1) {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const admin = await createTestUser();
    await addMember(workspace.id, admin.id, "workspace_admin");
    const staff = await createTestUser();
    await addMember(workspace.id, staff.id, "staff");
    const viewer = await createTestUser();
    await addMember(workspace.id, viewer.id, "viewer");
    const guide = await createTestUser();
    await addMember(workspace.id, guide.id, "guide");

    const tour = await prisma.tour.create({
      data: {
        workspaceId: workspace.id,
        title: "Role Test Tour",
        slug: `role-tour-${randomUUID().slice(0, 8)}`,
        durationMinutes: 60,
        capacity: 10,
        basePrice: 2000,
        status: "active",
        visibility: "public",
      },
    });
    const availability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt: new Date(Date.now() + 7 * 86_400_000),
        endsAt: new Date(Date.now() + 7 * 86_400_000 + 3_600_000),
        capacity: 10,
      },
    });

    const bookingResult = await createManualBookingViaService(workspace.id, tour.id, availability.id, admin.id, participantCount);

    return { workspace, tour, availability, owner, admin, staff, viewer, guide, booking: bookingResult };
  }

  async function createManualBookingViaService(
    workspaceId: string,
    tourId: string,
    availabilityId: string,
    createdById: string,
    participantCount: number,
  ) {
    const { createBooking } = await import("@/lib/bookings/service");
    const { booking } = await createBooking({
      workspaceId,
      tourId,
      availabilityId,
      participantCount,
      participants: Array.from({ length: participantCount }, (_, i) => ({ firstName: `P${i}`, lastName: "Guest" })),
      guestFirstName: "Manual",
      guestLastName: "Guest",
      guestEmail: "manual-guest@example.com",
      addons: [],
      source: "manual",
      requirePublicVisibility: false,
      createdById,
    });
    return booking;
  }

  it("unauthenticated requests are rejected with 401", async () => {
    asUnauthenticated();
    const { workspace } = await setup();
    const res = await listBookingsRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(401);
  });

  it("an outsider (no membership) gets 404 with zero data leaked", async () => {
    const { workspace } = await setup();
    const outsider = await createTestUser();
    asUser(outsider);
    const res = await listBookingsRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(404);
  });

  it("owner, admin, and staff can list bookings with full guest email visible", async () => {
    const { workspace, owner, admin, staff } = await setup();
    for (const actor of [owner, admin, staff]) {
      asUser(actor);
      const res = await listBookingsRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { bookings: { guestEmail: string | null }[] };
      expect(body.bookings.length).toBeGreaterThan(0);
      expect(body.bookings[0].guestEmail).toBe("manual-guest@example.com");
    }
  });

  it("viewer can list bookings but guest email is redacted", async () => {
    const { workspace, viewer } = await setup();
    asUser(viewer);
    const res = await listBookingsRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { bookings: { guestEmail: string | null }[] };
    expect(body.bookings[0].guestEmail).toBeNull();
  });

  it("guide receives 403 (no general booking access in Phase 3)", async () => {
    const { workspace, guide } = await setup();
    asUser(guide);
    const res = await listBookingsRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(403);
  });

  it("viewer cannot create a manual booking (403), staff can", async () => {
    const { workspace, tour, availability, viewer, staff } = await setup();
    const payload = {
      tourId: tour.id,
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "New", lastName: "Guest" }],
      guestFirstName: "New",
      guestLastName: "Guest",
      guestEmail: "new-guest@example.com",
      addons: [],
    };

    asUser(viewer);
    const denied = await createManualBookingRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify(payload) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(denied.status).toBe(403);

    asUser(staff);
    const allowed = await createManualBookingRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify(payload) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(allowed.status).toBe(201);
  });

  it("PATCH ignores fields outside the allowed contract (departure/price/participantCount are not settable)", async () => {
    const { workspace, admin, booking } = await setup();
    asUser(admin);
    const res = await patchBookingRoute(
      req("http://x/api", {
        method: "PATCH",
        body: JSON.stringify({
          guestFirstName: "Updated",
          totalAmount: 1,
          participantCount: 99,
          status: "cancelled",
        }),
      }),
      { params: Promise.resolve({ id: workspace.id, bookingId: booking.id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { booking: { guestName: string; totalAmount: number; status: string } };
    expect(body.booking.guestName).toBe("Updated Guest");
    expect(body.booking.totalAmount).toBe(booking.totalAmount); // unchanged — not a settable field
    expect(body.booking.status).toBe(booking.status); // unchanged — status has its own endpoint
  });

  it("status endpoint enforces the state machine: valid transition succeeds, invalid returns 409", async () => {
    const { workspace, admin, booking } = await setup();
    asUser(admin);

    const toCompleted = await statusRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ status: "completed" }) }),
      { params: Promise.resolve({ id: workspace.id, bookingId: booking.id }) },
    );
    expect(toCompleted.status).toBe(200);

    const invalid = await statusRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ status: "cancelled" }) }),
      { params: Promise.resolve({ id: workspace.id, bookingId: booking.id }) },
    );
    expect(invalid.status).toBe(409);
  });

  it("booking detail 404s for a booking in a different workspace", async () => {
    const { admin, booking } = await setup();
    const otherOwner = await createTestUser();
    const otherWorkspace = await createTestWorkspace(otherOwner.id);
    await addMember(otherWorkspace.id, otherOwner.id, "workspace_owner");
    asUser(admin);
    const res = await bookingDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: otherWorkspace.id, bookingId: booking.id }),
    });
    expect(res.status).toBe(404);
  });
});
