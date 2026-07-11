import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  requireAddon,
  requireAvailability,
  requireSchedule,
  requireTour,
} from "@/lib/tours/service";
import {
  createTestAvailability,
  createTestTour,
  createTestUser,
  createTestWorkspace,
  prisma,
} from "./helpers";

async function expectNotFound(fn: () => Promise<unknown>) {
  let thrown: unknown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ApiError);
  expect((thrown as ApiError).status).toBe(404);
}

describe("cross-tenant injection is rejected by every scoped tour lookup", () => {
  it("requireTour 404s when the tour belongs to a different workspace", async () => {
    const ownerA = await createTestUser();
    const workspaceA = await createTestWorkspace(ownerA.id);
    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    const tourB = await createTestTour(workspaceB.id);

    await expectNotFound(() => requireTour(workspaceA.id, tourB.id));
    // Sanity check: the correct workspace can read it.
    await expect(requireTour(workspaceB.id, tourB.id)).resolves.toMatchObject({ id: tourB.id });
  });

  it("requireSchedule 404s for a schedule under a foreign tour/workspace", async () => {
    const ownerA = await createTestUser();
    const workspaceA = await createTestWorkspace(ownerA.id);
    const tourA = await createTestTour(workspaceA.id);

    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    const tourB = await createTestTour(workspaceB.id);
    const scheduleB = await prisma.tourSchedule.create({
      data: {
        workspaceId: workspaceB.id,
        tourId: tourB.id,
        daysOfWeek: [1],
        startTime: "09:00",
        startsOn: new Date(),
      },
    });

    // Same workspace, wrong tour.
    await expectNotFound(() => requireSchedule(workspaceB.id, tourA.id, scheduleB.id));
    // Wrong workspace entirely.
    await expectNotFound(() => requireSchedule(workspaceA.id, tourB.id, scheduleB.id));
  });

  it("requireAddon 404s for an add-on under a foreign workspace", async () => {
    const ownerA = await createTestUser();
    const workspaceA = await createTestWorkspace(ownerA.id);
    const tourA = await createTestTour(workspaceA.id);

    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    const tourB = await createTestTour(workspaceB.id);
    const addonB = await prisma.tourAddon.create({
      data: { workspaceId: workspaceB.id, tourId: tourB.id, name: "Snacks", price: 500 },
    });

    await expectNotFound(() => requireAddon(workspaceA.id, tourA.id, addonB.id));
  });

  it("requireAvailability 404s for a departure under a foreign tour/workspace", async () => {
    const ownerA = await createTestUser();
    const workspaceA = await createTestWorkspace(ownerA.id);
    const tourA = await createTestTour(workspaceA.id);

    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    const tourB = await createTestTour(workspaceB.id);
    const availabilityB = await createTestAvailability(tourB);

    await expectNotFound(() => requireAvailability(workspaceA.id, tourA.id, availabilityB.id));
    await expectNotFound(() => requireAvailability(workspaceB.id, tourA.id, availabilityB.id));
  });
});
