import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { POST as createAvailabilityRoute } from "@/app/api/workspaces/[id]/tours/[tourId]/availabilities/route";
import { PATCH as updateAvailabilityRoute } from "@/app/api/workspaces/[id]/tours/[tourId]/availabilities/[availabilityId]/route";
import { GET as listGuidesRoute } from "@/app/api/workspaces/[id]/guides/route";
import { PATCH as updateGuideProfileRoute } from "@/app/api/workspaces/[id]/guides/[memberId]/route";
import { DELETE as removeMemberRoute } from "@/app/api/workspaces/[id]/members/[memberId]/route";
import { addMember, createTestTour, createTestUser, createTestWorkspace, prisma, entitleWorkspace } from "./helpers";

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
  await entitleWorkspace(workspace.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const guideUser = await createTestUser();
  const guideMember = await addMember(workspace.id, guideUser.id, "guide");
  const viewerUser = await createTestUser();
  const viewerMember = await addMember(workspace.id, viewerUser.id, "viewer");
  const tour = await createTestTour(workspace.id);
  return { owner, workspace, guideUser, guideMember, viewerUser, viewerMember, tour };
}

function futureDate(hoursFromNow: number) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

describe("guide assignment on availabilities", () => {
  it("assigns an active non-viewer member as guideId and persists it", async () => {
    const { owner, workspace, guideMember, tour } = await setup();
    asUser(owner);

    const res = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), guideId: guideMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { availability: { guideId: string | null } };
    expect(body.availability.guideId).toBe(guideMember.id);
  });

  it("rejects assigning a viewer as guide", async () => {
    const { owner, workspace, viewerMember, tour } = await setup();
    asUser(owner);

    const res = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), guideId: viewerMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects assigning a member from a different workspace", async () => {
    const { owner, workspace, tour } = await setup();
    const otherOwner = await createTestUser();
    const otherWorkspace = await createTestWorkspace(otherOwner.id);
    await entitleWorkspace(otherWorkspace.id);
    const otherStaffUser = await createTestUser();
    const otherStaffMember = await addMember(otherWorkspace.id, otherStaffUser.id, "staff");

    asUser(owner);
    const res = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), guideId: otherStaffMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    expect(res.status).toBe(400);
  });

  it("can reassign and unassign a guide via PATCH", async () => {
    const { owner, workspace, guideMember, tour } = await setup();
    asUser(owner);
    const created = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), guideId: guideMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await created.json()) as { availability: { id: string; guideId: string } };
    expect(availability.guideId).toBe(guideMember.id);

    const patched = await updateAvailabilityRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ guideId: null }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id, availabilityId: availability.id }) },
    );
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as { availability: { guideId: string | null } };
    expect(patchedBody.availability.guideId).toBeNull();
  });
});

describe("member removal clears dependent guide assignments", () => {
  it("removing a member assigned as guide clears guideId instead of failing (composite FK is onDelete: Restrict)", async () => {
    const { owner, workspace, guideMember, tour } = await setup();
    asUser(owner);
    const created = await createAvailabilityRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ startsAt: futureDate(24), guideId: guideMember.id }) }),
      { params: Promise.resolve({ id: workspace.id, tourId: tour.id }) },
    );
    const { availability } = (await created.json()) as { availability: { id: string } };

    const removed = await removeMemberRoute(req("http://x/api", { method: "DELETE" }), {
      params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }),
    });
    expect(removed.status).toBe(200);

    const refreshed = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(refreshed.guideId).toBeNull();
  });
});

describe("guide profiles", () => {
  it("owner can upsert certifications/notes; staff is denied management but can still view the roster", async () => {
    const { owner, workspace, guideMember } = await setup();
    const staffUser = await createTestUser();
    await addMember(workspace.id, staffUser.id, "staff");

    asUser(staffUser);
    const denied = await updateGuideProfileRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ certifications: ["Wilderness First Aid"] }) }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    expect(denied.status).toBe(403);

    asUser(owner);
    const allowed = await updateGuideProfileRoute(
      req("http://x/api", {
        method: "PATCH",
        body: JSON.stringify({ certifications: ["Wilderness First Aid", "PADI Divemaster"], notes: "Speaks Spanish" }),
      }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { guideProfile: { certifications: string[]; notes: string | null } };
    expect(body.guideProfile.certifications).toEqual(["Wilderness First Aid", "PADI Divemaster"]);
    expect(body.guideProfile.notes).toBe("Speaks Spanish");

    asUser(staffUser);
    const list = await listGuidesRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { guides: { id: string; certifications: string[] }[] };
    const guideEntry = listBody.guides.find((g) => g.id === guideMember.id);
    expect(guideEntry?.certifications).toEqual(["Wilderness First Aid", "PADI Divemaster"]);
  });

  it("a repeat PATCH updates the same profile row rather than creating a duplicate", async () => {
    const { owner, workspace, guideMember } = await setup();
    asUser(owner);
    await updateGuideProfileRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ certifications: ["A"] }) }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );
    await updateGuideProfileRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ certifications: ["A", "B"] }) }),
      { params: Promise.resolve({ id: workspace.id, memberId: guideMember.id }) },
    );

    const count = await prisma.guideProfile.count({ where: { workspaceId: workspace.id, memberId: guideMember.id } });
    expect(count).toBe(1);
    const profile = await prisma.guideProfile.findUniqueOrThrow({ where: { workspaceId_memberId: { workspaceId: workspace.id, memberId: guideMember.id } } });
    expect(profile.certifications).toEqual(["A", "B"]);
  });

  it("viewer can view the guide roster (read-only)", async () => {
    const { workspace, viewerUser } = await setup();
    asUser(viewerUser);
    const res = await listGuidesRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    expect(res.status).toBe(200);
  });
});
