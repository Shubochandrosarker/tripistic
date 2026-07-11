import { describe, expect, it } from "vitest";
import { archiveTour } from "@/lib/tours/archive";
import {
  createTestAvailability,
  createTestTour,
  createTestUser,
  createTestWorkspace,
  prisma,
} from "./helpers";

describe("canonical archive service", () => {
  it("archive (no soft delete): pauses active schedules and cancels future scheduled slots, keeps the tour visible", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id, { status: "active" });
    const schedule = await prisma.tourSchedule.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        daysOfWeek: [1],
        startTime: "09:00",
        startsOn: new Date(),
        status: "active",
      },
    });
    const futureSlot = await createTestAvailability(tour, {
      startsAt: new Date(Date.now() + 86_400_000),
    });
    const pastSlot = await createTestAvailability(tour, {
      startsAt: new Date(Date.now() - 86_400_000),
    });

    const result = await archiveTour({ workspaceId: workspace.id, tourId: tour.id, softDelete: false });

    expect(result.tour.status).toBe("archived");
    expect(result.tour.deletedAt).toBeNull();
    expect(result.pausedSchedules).toBe(1);
    expect(result.cancelledSlots).toBe(1);

    const persistedSchedule = await prisma.tourSchedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(persistedSchedule.status).toBe("paused");

    const persistedFuture = await prisma.availability.findUniqueOrThrow({ where: { id: futureSlot.id } });
    expect(persistedFuture.status).toBe("cancelled");

    // A slot already in the past is left alone — nothing to protect there.
    const persistedPast = await prisma.availability.findUniqueOrThrow({ where: { id: pastSlot.id } });
    expect(persistedPast.status).toBe("scheduled");

    const stillListed = await prisma.tour.findFirst({ where: { id: tour.id, deletedAt: null } });
    expect(stillListed).not.toBeNull();
  });

  it("soft delete: does everything archive does, plus hides the tour from the catalog", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id, { status: "active" });
    await createTestAvailability(tour, { startsAt: new Date(Date.now() + 86_400_000) });

    const result = await archiveTour({ workspaceId: workspace.id, tourId: tour.id, softDelete: true });

    expect(result.tour.status).toBe("archived");
    expect(result.tour.deletedAt).not.toBeNull();
    expect(result.cancelledSlots).toBe(1);

    const catalogLookup = await prisma.tour.findFirst({ where: { id: tour.id, deletedAt: null } });
    expect(catalogLookup).toBeNull();
  });

  it("is idempotent-safe to call again on an already-archived tour (no double cancellation errors)", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id, { status: "active" });
    await createTestAvailability(tour, { startsAt: new Date(Date.now() + 86_400_000) });

    await archiveTour({ workspaceId: workspace.id, tourId: tour.id, softDelete: false });
    const second = await archiveTour({ workspaceId: workspace.id, tourId: tour.id, softDelete: false });

    expect(second.tour.status).toBe("archived");
    expect(second.cancelledSlots).toBe(0); // already cancelled by the first call
  });

  it("rejects archiving a tour that belongs to a different workspace", async () => {
    const ownerA = await createTestUser();
    const workspaceA = await createTestWorkspace(ownerA.id);
    const ownerB = await createTestUser();
    const workspaceB = await createTestWorkspace(ownerB.id);
    const tourB = await createTestTour(workspaceB.id);

    await expect(
      archiveTour({ workspaceId: workspaceA.id, tourId: tourB.id, softDelete: false }),
    ).rejects.toThrow();
  });
});
