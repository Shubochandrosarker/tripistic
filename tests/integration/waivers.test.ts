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
import { GET as waiverTemplateRoute, PUT as publishWaiverRoute } from "@/app/api/workspaces/[id]/waiver-template/route";
import { GET as publicWaiverGetRoute, POST as publicWaiverPostRoute } from "@/app/api/public/bookings/[publicToken]/waiver/route";
import { addMember, createBookableFixture, createTestUser, createTestWorkspace, prisma, entitleWorkspace } from "./helpers";

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

const SAMPLE_SIGNATURE = `data:image/png;base64,${"A".repeat(200)}`;

function bookingInput(workspaceId: string, tourId: string, availabilityId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId,
    tourId,
    availabilityId,
    participantCount: 1,
    participants: [{ firstName: "Guest", lastName: "One" }],
    guestFirstName: "Guest",
    guestLastName: "One",
    guestEmail: `waiver-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct" as const,
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function publishSampleWaiver(workspaceId: string, ownerUser: { id: string }, title = "Liability Waiver") {
  asUser(ownerUser);
  return publishWaiverRoute(
    req("http://x/api", {
      method: "PUT",
      body: JSON.stringify({ title, bodyText: "I acknowledge the risks of this activity and release the operator from liability." }),
    }),
    { params: Promise.resolve({ id: workspaceId }) },
  );
}

describe("waiver template versioning", () => {
  it("publishing creates version 1; publishing again creates version 2 without mutating version 1", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await entitleWorkspace(workspace.id);
    await addMember(workspace.id, owner.id, "workspace_owner");

    const first = await publishSampleWaiver(workspace.id, owner, "Liability Waiver");
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { version: { versionNumber: number } };
    expect(firstBody.version.versionNumber).toBe(1);

    asUser(owner);
    const second = await publishWaiverRoute(
      req("http://x/api", {
        method: "PUT",
        body: JSON.stringify({ title: "Liability Waiver v2", bodyText: "Updated waiver text with additional risk disclosures for this activity." }),
      }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    const secondBody = (await second.json()) as { version: { versionNumber: number } };
    expect(secondBody.version.versionNumber).toBe(2);

    const versions = await prisma.waiverVersion.findMany({ where: { workspaceId: workspace.id }, orderBy: { versionNumber: "asc" } });
    expect(versions).toHaveLength(2);
    expect(versions[0].title).toBe("Liability Waiver"); // untouched by the second publish

    asUser(owner);
    const getRes = await waiverTemplateRoute(req("http://x/api"), { params: Promise.resolve({ id: workspace.id }) });
    const getBody = (await getRes.json()) as { currentVersion: { versionNumber: number } };
    expect(getBody.currentVersion.versionNumber).toBe(2);
  });

  it("staff cannot publish a waiver version (403)", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    await entitleWorkspace(workspace.id);
    await addMember(workspace.id, owner.id, "workspace_owner");
    const staffUser = await createTestUser();
    await addMember(workspace.id, staffUser.id, "staff");

    asUser(staffUser);
    const res = await publishWaiverRoute(
      req("http://x/api", { method: "PUT", body: JSON.stringify({ title: "X", bodyText: "Some waiver text long enough to pass validation." }) }),
      { params: Promise.resolve({ id: workspace.id }) },
    );
    expect(res.status).toBe(403);
  });
});

describe("waiver signing", () => {
  async function waiverReadyFixture() {
    const { owner, workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, waiverRequired: true } });
    await publishSampleWaiver(workspace.id, owner);
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    return { owner, workspace, tour, availability, booking };
  }

  it("records a valid signature linked to the correct booking/participant/version", async () => {
    const { workspace, booking } = await waiverReadyFixture();
    const participant = booking.participants[0];

    const res = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Jane Doe", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );
    expect(res.status).toBe(201);

    const signature = await prisma.waiverSignature.findUniqueOrThrow({
      where: { workspaceId_participantId: { workspaceId: workspace.id, participantId: participant.id } },
    });
    expect(signature.bookingId).toBe(booking.id);
    expect(signature.signerName).toBe("Jane Doe");
    expect(signature.waiverVersionId).not.toBeNull();
  });

  it("is idempotent — signing again for the same participant returns the existing record, not a duplicate", async () => {
    const { booking } = await waiverReadyFixture();
    const participant = booking.participants[0];

    const first = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Jane Doe", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );
    expect(first.status).toBe(201);

    const second = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Someone Else", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { alreadySigned: boolean };
    expect(secondBody.alreadySigned).toBe(true);

    const count = await prisma.waiverSignature.count({ where: { participantId: participant.id } });
    expect(count).toBe(1);
    // The original signature is untouched by the replayed attempt.
    const signature = await prisma.waiverSignature.findFirstOrThrow({ where: { participantId: participant.id } });
    expect(signature.signerName).toBe("Jane Doe");
  });

  it("rejects signing for a tour that does not require a waiver", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, waiverRequired: false } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    const participant = booking.participants[0];

    const res = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Jane Doe", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects signing before any waiver version has been published", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { basePrice: 0, waiverRequired: true } });
    const { booking } = await createBooking(bookingInput(workspace.id, tour.id, availability.id));
    const participant = booking.participants[0];
    void workspace;

    const res = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Jane Doe", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );
    expect(res.status).toBe(400);
  });

  it("rejects a participant id that does not belong to the booking behind the given publicToken", async () => {
    const fixtureA = await waiverReadyFixture();
    const { owner: ownerB, workspace: workspaceB, tour: tourB, availability: availabilityB } = await createBookableFixture({
      tour: { basePrice: 0, waiverRequired: true },
    });
    await publishSampleWaiver(workspaceB.id, ownerB);
    const { booking: bookingB } = await createBooking(bookingInput(workspaceB.id, tourB.id, availabilityB.id));

    const res = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: fixtureA.booking.participants[0].id, signerName: "Jane Doe", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: bookingB.publicToken }) },
    );
    expect(res.status).toBe(404);
  });

  it("rejects a malformed signature image", async () => {
    const { booking } = await waiverReadyFixture();
    const participant = booking.participants[0];

    const res = await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Jane Doe", signatureImage: "not-a-data-url" }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );
    expect(res.status).toBe(400);
  });

  it("GET returns the current waiver text and per-participant signed status", async () => {
    const { booking } = await waiverReadyFixture();
    const participant = booking.participants[0];
    await publicWaiverPostRoute(
      req("http://x/api", {
        method: "POST",
        body: JSON.stringify({ participantId: participant.id, signerName: "Jane Doe", signatureImage: SAMPLE_SIGNATURE }),
      }),
      { params: Promise.resolve({ publicToken: booking.publicToken }) },
    );

    const res = await publicWaiverGetRoute(req("http://x/api"), { params: Promise.resolve({ publicToken: booking.publicToken }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { waiver: { title: string } | null; participants: { signed: boolean }[] };
    expect(body.waiver?.title).toBe("Liability Waiver");
    expect(body.participants[0].signed).toBe(true);
  });
});
