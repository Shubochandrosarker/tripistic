import { TZDate } from "@date-fns/tz";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { POST as createAvailabilityRoute } from "@/app/api/workspaces/[id]/tours/[tourId]/availabilities/route";
import { GET as opsBoardRoute } from "@/app/api/workspaces/[id]/operations/board/route";
import { POST as transitionStatusRoute } from "@/app/api/workspaces/[id]/operations/availabilities/[availabilityId]/status/route";
import { GET as opsEventsRoute } from "@/app/api/workspaces/[id]/operations/availabilities/[availabilityId]/events/route";
import { PATCH as assignPartyRoute } from "@/app/api/workspaces/[id]/operations/availabilities/[availabilityId]/assign/route";
import { POST as checkInRoute } from "@/app/api/workspaces/[id]/bookings/[bookingId]/checkin/route";
import { POST as createIncidentRoute, GET as listIncidentsRoute } from "@/app/api/workspaces/[id]/incidents/route";
import { PATCH as updateIncidentRoute } from "@/app/api/workspaces/[id]/incidents/[incidentId]/route";
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

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/** The "YYYY-MM-DD" calendar date `date` falls on in `timezone` — matches how the ops board resolves "today". */
function dateKeyInTz(date: Date, timezone: string): string {
  const local = new TZDate(date, timezone);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

async function setup() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const viewerUser = await createTestUser();
  await addMember(workspace.id, viewerUser.id, "viewer");
  const tour = await createTestTour(workspace.id);
  return { owner, workspace, viewerUser, tour };
}

describe("operations board and ops-status transitions", () => {
  it("lists today's departures and enforces the ops-status transition graph", async () => {
    const { owner, workspace, tour } = await setup();
    asUser(owner);

    const startsAt = hoursFromNow(2);
    const created = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: startsAt.toISOString() }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await created.json()) as { availability: { id: string; startsAt: string } };

    const dateKey = dateKeyInTz(startsAt, workspace.timezone);
    const board = await opsBoardRoute(req(`http://x/api?date=${dateKey}`), {
      params: Promise.resolve({ id: workspace.id }),
    });
    expect(board.status).toBe(200);
    const boardBody = (await board.json()) as { departures: { id: string; opsStatus: string }[] };
    expect(boardBody.departures.map((d) => d.id)).toContain(availability.id);
    expect(boardBody.departures.find((d) => d.id === availability.id)?.opsStatus).toBe("scheduled");

    // scheduled -> boarding is a valid transition.
    const toBoarding = await transitionStatusRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ status: "boarding" }) }),
      { params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }) },
    );
    expect(toBoarding.status).toBe(200);

    // boarding -> completed directly is not a valid transition (must go through in_progress).
    const invalid = await transitionStatusRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ status: "completed" }) }),
      { params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }) },
    );
    expect(invalid.status).toBe(400);

    const events = await opsEventsRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }),
    });
    const eventsBody = (await events.json()) as { events: { type: string }[] };
    expect(eventsBody.events.some((e) => e.type === "status_changed")).toBe(true);
  });

  it("assigns guide/driver/vehicle in one dispatch call and rejects an ineligible member", async () => {
    const { owner, workspace, tour } = await setup();
    asUser(owner);
    const created = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: hoursFromNow(5).toISOString() }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await created.json()) as { availability: { id: string } };

    const guideUser = await createTestUser();
    const guideMember = await addMember(workspace.id, guideUser.id, "guide");

    const assigned = await assignPartyRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ guideId: guideMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }) },
    );
    expect(assigned.status).toBe(200);

    const viewerUser = await createTestUser();
    const viewerMember = await addMember(workspace.id, viewerUser.id, "viewer");
    const rejected = await assignPartyRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ guideId: viewerMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }) },
    );
    expect(rejected.status).toBe(400);
  });

  it("viewer can view the ops board but not transition status", async () => {
    const { owner, workspace, viewerUser, tour } = await setup();
    asUser(owner);
    const created = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: hoursFromNow(3).toISOString() }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await created.json()) as { availability: { id: string } };

    asUser(viewerUser);
    const board = await opsBoardRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(board.status).toBe(200);

    const denied = await transitionStatusRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ status: "boarding" }) }),
      { params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }) },
    );
    expect(denied.status).toBe(403);
  });
});

describe("guest check-in", () => {
  it("checks in a confirmed booking and rejects a second check-in of a pending one", async () => {
    const { owner, workspace, tour } = await setup();
    asUser(owner);
    const availRoute = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: hoursFromNow(6).toISOString() }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await availRoute.json()) as { availability: { id: string } };

    const { booking } = await createBooking({
      workspaceId: workspace.id,
      tourId: tour.id,
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "Guest", lastName: "One" }],
      guestFirstName: "Guest",
      guestLastName: "One",
      guestEmail: "checkin-guest@example.com",
      addons: [],
      source: "manual",
      status: "confirmed",
      requirePublicVisibility: false,
      idempotencyKey: crypto.randomUUID(),
    });

    const checkedIn = await checkInRoute(req("http://x/api", { method: "POST" }), {
      params: Promise.resolve({ id: workspace.id, bookingId: booking.id }),
    });
    expect(checkedIn.status).toBe(200);

    const refreshed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(refreshed.checkedInAt).not.toBeNull();

    // Checking in a pending booking is rejected.
    const { booking: pendingBooking } = await createBooking({
      workspaceId: workspace.id,
      tourId: tour.id,
      availabilityId: availability.id,
      participantCount: 1,
      participants: [{ firstName: "Guest", lastName: "Two" }],
      guestFirstName: "Guest",
      guestLastName: "Two",
      guestEmail: "pending-guest@example.com",
      addons: [],
      source: "manual",
      status: "pending",
      requirePublicVisibility: false,
      idempotencyKey: crypto.randomUUID(),
    });
    const rejected = await checkInRoute(req("http://x/api", { method: "POST" }), {
      params: Promise.resolve({ id: workspace.id, bookingId: pendingBooking.id }),
    });
    expect(rejected.status).toBe(400);
  });
});

describe("dispatch incidents", () => {
  it("reports and resolves an incident, logging an ops event when linked to a departure", async () => {
    const { owner, workspace, tour } = await setup();
    asUser(owner);
    const availRoute = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: hoursFromNow(4).toISOString() }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await availRoute.json()) as { availability: { id: string } };

    const created = await createIncidentRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ availabilityId: availability.id, severity: "high", category: "vehicle", description: "Flat tire en route" }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(created.status).toBe(201);
    const { incident } = (await created.json()) as { incident: { id: string; status: string } };
    expect(incident.status).toBe("open");

    const resolved = await updateIncidentRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "resolved", resolutionNotes: "Spare fitted" }) }),
      { params: Promise.resolve({ id: workspace.id, incidentId: incident.id }) },
    );
    expect(resolved.status).toBe(200);
    const resolvedBody = (await resolved.json()) as { incident: { status: string; resolvedAt: string | null } };
    expect(resolvedBody.incident.status).toBe("resolved");
    expect(resolvedBody.incident.resolvedAt).not.toBeNull();

    const events = await opsEventsRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, availabilityId: availability.id }),
    });
    const eventsBody = (await events.json()) as { events: { type: string }[] };
    expect(eventsBody.events.some((e) => e.type === "incident_reported")).toBe(true);
  });

  it("lists incidents filtered by severity", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    await createIncidentRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ severity: "critical", description: "Medical emergency on site" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    await createIncidentRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ severity: "low", description: "Minor delay due to traffic" }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );

    const list = await listIncidentsRoute(req("http://x/api?severity=critical"), {
      params: Promise.resolve({ id: workspace.id }),
    });
    const body = (await list.json()) as { total: number };
    expect(body.total).toBe(1);
  });
});
