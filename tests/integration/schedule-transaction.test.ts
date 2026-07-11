import { describe, expect, it } from "vitest";
import type { Tour, TourSchedule } from "@prisma/client";
import { prisma, createTestTour, createTestUser, createTestWorkspace } from "./helpers";
import { generateSlotsForSchedule } from "@/lib/tours/schedule";

describe("transaction-safe schedule creation", () => {
  it("creates the schedule and its slots together on the happy path", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id, { timezone: "America/Phoenix" });
    const tour = await createTestTour(workspace.id);

    const { schedule, created } = await prisma.$transaction(async (tx) => {
      const schedule = await tx.tourSchedule.create({
        data: {
          workspaceId: workspace.id,
          tourId: tour.id,
          daysOfWeek: [1, 3, 5],
          startTime: "09:00",
          startsOn: new Date(),
        },
      });
      const created = await generateSlotsForSchedule(tx, {
        tour,
        schedule,
        timezone: workspace.timezone,
        days: 30,
      });
      return { schedule, created };
    });

    expect(created).toBeGreaterThan(0);
    const persistedSchedule = await prisma.tourSchedule.findUnique({ where: { id: schedule.id } });
    expect(persistedSchedule).not.toBeNull();
    const slots = await prisma.availability.count({ where: { scheduleId: schedule.id } });
    expect(slots).toBe(created);
  });

  it("rolls back the schedule row when generation fails inside the same transaction", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id);

    let thrown: unknown = null;
    try {
      await prisma.$transaction(async (tx) => {
        const schedule = await tx.tourSchedule.create({
          data: {
            workspaceId: workspace.id,
            tourId: tour.id,
            daysOfWeek: [1],
            startTime: "09:00",
            startsOn: new Date(),
          },
        });
        // An invalid timezone reaching slot generation (e.g. a legacy bad
        // value) must fail the whole attempt, not half-persist it.
        await generateSlotsForSchedule(tx, {
          tour,
          schedule,
          timezone: "Not/AValidZone",
          days: 30,
        });
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).not.toBeNull();
    const scheduleCount = await prisma.tourSchedule.count({ where: { tourId: tour.id } });
    expect(scheduleCount).toBe(0);
  });

  it("never generates slots for an archived tour, even if a caller forgets the route-level guard", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour: Tour = await createTestTour(workspace.id, { status: "archived" });
    const schedule: TourSchedule = await prisma.tourSchedule.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: "09:00",
        startsOn: new Date(),
      },
    });

    const created = await generateSlotsForSchedule(prisma, {
      tour,
      schedule,
      timezone: workspace.timezone,
      days: 30,
    });

    expect(created).toBe(0);
    const slots = await prisma.availability.count({ where: { scheduleId: schedule.id } });
    expect(slots).toBe(0);
  });
});
