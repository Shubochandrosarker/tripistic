import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { PATCH as updateGuideProfileRoute } from "@/app/api/workspaces/[id]/guides/[memberId]/route";
import { POST as createTimeOffRoute } from "@/app/api/workspaces/[id]/guides/[memberId]/time-off/route";
import { POST as createTimeEntryRoute } from "@/app/api/workspaces/[id]/guides/[memberId]/time-entries/route";
import { POST as createRatingRoute } from "@/app/api/workspaces/[id]/guides/[memberId]/ratings/route";
import { POST as createAvailabilityRoute } from "@/app/api/workspaces/[id]/tours/[tourId]/availabilities/route";
import { GET as matchStaffRoute } from "@/app/api/workspaces/[id]/tours/[tourId]/availabilities/[availabilityId]/match/route";
import { DELETE as removeMemberRoute } from "@/app/api/workspaces/[id]/members/[memberId]/route";
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

function futureDate(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

async function setup() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const guideUser = await createTestUser();
  const guideMember = await addMember(workspace.id, guideUser.id, "guide");
  const tour = await createTestTour(workspace.id);
  return { owner, workspace, guideUser, guideMember, tour };
}

describe("extended workforce profile", () => {
  it("owner can set languages/skills/kind/active on a guide profile", async () => {
    const { owner, workspace, guideMember } = await setup();
    asUser(owner);

    const res = await updateGuideProfileRoute(
      req("http://x/api", {
        method: "PATCH",
        body: JSON.stringify({ languages: ["English", "Spanish"], skills: ["Kayaking"], kind: "both", active: true }),
      }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { guideProfile: { languages: string[]; kind: string } };
    expect(body.guideProfile.languages).toEqual(["English", "Spanish"]);
    expect(body.guideProfile.kind).toBe("both");
  });
});

describe("time off, time entries, ratings", () => {
  it("records time off, hours, and a rating for a member", async () => {
    const { owner, workspace, guideMember } = await setup();
    asUser(owner);

    const timeOff = await createTimeOffRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ startsOn: "2026-08-01", endsOn: "2026-08-05", status: "approved" }),
      }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    expect(timeOff.status).toBe(201);

    const timeEntry = await createTimeEntryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ workedOn: "2026-07-20", minutes: 240 }) }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    expect(timeEntry.status).toBe(201);

    const rating = await createRatingRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ ratingValue: 5, comment: "Excellent" }) }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    expect(rating.status).toBe(201);

    const avg = await prisma.guideRating.aggregate({
      where: { workspaceId: workspace.id, memberId: guideMember.id },
      _avg: { ratingValue: true },
    });
    expect(avg._avg.ratingValue).toBe(5);
  });

  it("rejects a rating outside 1-5 at the database CHECK constraint", async () => {
    const { workspace, guideMember } = await setup();
    await expect(
      prisma.guideRating.create({
        data: { workspaceId: workspace.id, memberId: guideMember.id, ratingValue: 9 },
      }),
    ).rejects.toThrow();
  });
});

describe("AI guide/driver matching", () => {
  it("excludes a candidate with an approved time-off conflict and one who is already double-booked", async () => {
    const { owner, workspace, guideMember, tour } = await setup();
    asUser(owner);

    // A second eligible guide with no conflicts.
    const otherGuideUser = await createTestUser();
    const otherGuideMember = await addMember(workspace.id, otherGuideUser.id, "guide");
    await prisma.guideProfile.create({
      data: { workspaceId: workspace.id, memberId: otherGuideMember.id, kind: "guide", active: true, languages: ["English"] },
    });
    await prisma.guideProfile.create({
      data: { workspaceId: workspace.id, memberId: guideMember.id, kind: "guide", active: true, languages: ["English"] },
    });

    const targetAvailability = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(48) }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await targetAvailability.json()) as { availability: { id: string; startsAt: string; endsAt: string } };

    // guideMember has approved time off covering the target departure.
    await createTimeOffRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({
          startsOn: availability.startsAt.slice(0, 10),
          endsOn: availability.startsAt.slice(0, 10),
          status: "approved",
        }),
      }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );

    // otherGuideMember is already assigned to a different, overlapping departure
    // (on a second tour — availabilities are unique per (tourId, startsAt), so
    // the overlapping conflict must come from a different tour).
    const secondTour = await createTestTour(workspace.id);
    const conflicting = await createAvailabilityRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ startsAt: availability.startsAt, guideId: otherGuideMember.id }),
      }),
      { params: Promise.resolve({ id: workspace.id, tourId: secondTour.id }) },
    );
    expect(conflicting.status).toBe(201);

    const matched = await matchStaffRoute(req(`http://x/api?role=guide`), {
      params: Promise.resolve({ id: workspace.id, tourId: tour.id, availabilityId: availability.id }),
    });
    expect(matched.status).toBe(200);
    const body = (await matched.json()) as { candidates: { memberId: string }[] };
    const candidateIds = body.candidates.map((c) => c.memberId);
    expect(candidateIds).not.toContain(guideMember.id);
    expect(candidateIds).not.toContain(otherGuideMember.id);
  });
});

describe("member removal clears driver assignments", () => {
  it("removing a member assigned as driver clears driverId instead of failing", async () => {
    const { owner, workspace, guideMember, tour } = await setup();
    asUser(owner);

    const created = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), driverId: guideMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await created.json()) as { availability: { id: string; driverId: string } };
    expect(availability.driverId).toBe(guideMember.id);

    const removed = await removeMemberRoute(req("http://x/api", { method: "DELETE" }), {
      params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }),
    });
    expect(removed.status).toBe(200);

    const refreshed = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(refreshed.driverId).toBeNull();
  });
});
