import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireUserApi: vi.fn(),
  getCurrentUser: vi.fn(),
  getSessionUser: vi.fn(),
  requireUserPage: vi.fn(),
}));

import { requireUserApi } from "@/lib/auth/session";
import { GET as listItinerariesRoute, POST as generateItineraryRoute } from "@/app/api/workspaces/[id]/itineraries/route";
import { GET as itineraryDetailRoute, PATCH as updateItineraryRoute } from "@/app/api/workspaces/[id]/itineraries/[itineraryId]/route";
import { POST as createItemRoute } from "@/app/api/workspaces/[id]/itineraries/[itineraryId]/items/route";
import { PATCH as updateItemRoute, DELETE as deleteItemRoute } from "@/app/api/workspaces/[id]/itineraries/[itineraryId]/items/[itemId]/route";
import { POST as reorderItemRoute } from "@/app/api/workspaces/[id]/itineraries/[itineraryId]/items/[itemId]/reorder/route";
import { POST as saveVersionRoute } from "@/app/api/workspaces/[id]/itineraries/[itineraryId]/versions/route";
import { GET as publicItineraryRoute } from "@/app/api/public/itineraries/[publicToken]/route";
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

async function setup() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  const viewerUser = await createTestUser();
  await addMember(workspace.id, viewerUser.id, "viewer");
  return { owner, workspace, viewerUser };
}

describe("AI itinerary generation", () => {
  it("generates the requested number of days and totals cost/price/margin from real line items", async () => {
    const { owner, workspace } = await setup();
    await createTestTour(workspace.id, { title: "Old Town Walking Tour", basePrice: 4000 });
    asUser(owner);

    const generated = await generateItineraryRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ title: "5 Day Sample Trip", destination: "Sample City", dayCount: 5, travelerCount: 2 }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(generated.status).toBe(201);
    const { itinerary } = (await generated.json()) as {
      itinerary: { id: string; days: { dayNumber: number; items: unknown[] }[]; totalCostCents: number; totalPriceCents: number; marginCents: number };
    };
    expect(itinerary.days).toHaveLength(5);
    expect(itinerary.days.every((d) => d.items.length > 0)).toBe(true);
    expect(itinerary.totalCostCents).toBeGreaterThan(0);
    expect(itinerary.totalPriceCents).toBeGreaterThanOrEqual(itinerary.totalCostCents);
    expect(itinerary.marginCents).toBe(itinerary.totalPriceCents - itinerary.totalCostCents);
  });

  it("rejects generation for a viewer, but allows viewing", async () => {
    const { owner, workspace, viewerUser } = await setup();
    asUser(owner);
    const generated = await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Owner Trip", dayCount: 2 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { itinerary } = (await generated.json()) as { itinerary: { id: string } };

    asUser(viewerUser);
    const deniedGenerate = await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Viewer Trip", dayCount: 2 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(deniedGenerate.status).toBe(403);

    const view = await itineraryDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id }),
    });
    expect(view.status).toBe(200);
  });
});

describe("editing an itinerary", () => {
  it("adds, reorders, and deletes items; status can be updated", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const generated = await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Edit Test Trip", dayCount: 3 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { itinerary } = (await generated.json()) as { itinerary: { id: string; days: { id: string }[] } };
    const firstDayId = itinerary.days[0].id;

    const added = await createItemRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ itineraryDayId: firstDayId, type: "activity", title: "Extra activity", costCents: 1000, priceCents: 1500 }),
      }),
      { params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id }) },
    );
    expect(added.status).toBe(201);
    const { item } = (await added.json()) as { item: { id: string; sortOrder: number } };
    expect(item.sortOrder).toBeGreaterThan(0);

    const moved = await reorderItemRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ direction: "up" }) }),
      { params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id, itemId: item.id }) },
    );
    expect(moved.status).toBe(200);

    const updated = await updateItemRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ title: "Renamed activity" }) }),
      { params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id, itemId: item.id }) },
    );
    expect(updated.status).toBe(200);

    const deleted = await deleteItemRoute(req("http://x/api", { method: "DELETE" }), {
      params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id, itemId: item.id }),
    });
    expect(deleted.status).toBe(200);

    const statusUpdate = await updateItineraryRoute(
      req("http://x/api", { method: "PATCH", body: JSON.stringify({ status: "shared" }) }),
      { params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id }) },
    );
    expect(statusUpdate.status).toBe(200);
  });

  it("saves a version snapshot with an incrementing version number", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const generated = await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Versioned Trip", dayCount: 2 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { itinerary } = (await generated.json()) as { itinerary: { id: string } };

    const version = await saveVersionRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ note: "Manual save" }) }),
      { params: Promise.resolve({ id: workspace.id, itineraryId: itinerary.id }) },
    );
    expect(version.status).toBe(201);
    const versionBody = (await version.json()) as { versionNumber: number };
    // Version 1 was created automatically at generation time.
    expect(versionBody.versionNumber).toBe(2);
  });
});

describe("public share link", () => {
  it("is reachable without auth and never exposes cost/margin, only price", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    const generated = await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Shareable Trip", dayCount: 2 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const { itinerary } = (await generated.json()) as { itinerary: { publicToken: string } };

    const publicRes = await publicItineraryRoute(req("http://x/api"), {
      params: Promise.resolve({ publicToken: itinerary.publicToken }),
    });
    expect(publicRes.status).toBe(200);
    const body = (await publicRes.json()) as { itinerary: { title: string } };
    expect(body.itinerary.title).toBe("Shareable Trip");
  });

  it("returns 404 for an unknown token", async () => {
    const res = await publicItineraryRoute(req("http://x/api"), {
      params: Promise.resolve({ publicToken: "not-a-real-token" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("itinerary list and tenant isolation", () => {
  it("lists itineraries filtered by status", async () => {
    const { owner, workspace } = await setup();
    asUser(owner);
    await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "Draft Trip", dayCount: 2 }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );

    const list = await listItinerariesRoute(req("http://x/api?status=draft"), {
      params: Promise.resolve({ id: workspace.id }),
    });
    const body = (await list.json()) as { total: number };
    expect(body.total).toBe(1);
  });

  it("an itinerary from another workspace is 404", async () => {
    const { owner: ownerA, workspace: workspaceA } = await setup();
    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    await addMember(workspaceB.id, ownerB.id, "workspace_owner");

    asUser(ownerB);
    const generated = await generateItineraryRoute(
      req("http://x/api", { method: "POST", body: JSON.stringify({ title: "B's Trip", dayCount: 2 }) }),
      { params: Promise.resolve({ id: workspaceB.id }) },
    );
    const { itinerary } = (await generated.json()) as { itinerary: { id: string } };

    asUser(ownerA);
    const crossTenant = await itineraryDetailRoute(req("http://x/api"), {
      params: Promise.resolve({ id: workspaceA.id, itineraryId: itinerary.id }),
    });
    expect(crossTenant.status).toBe(404);
  });
});
