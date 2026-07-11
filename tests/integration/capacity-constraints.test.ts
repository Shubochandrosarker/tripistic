import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma, createTestTour, createTestUser, createTestWorkspace } from "./helpers";

async function expectCheckViolation(fn: () => Promise<unknown>) {
  let thrown: unknown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  // P2010 = raw query failed; the underlying Postgres error code for a CHECK
  // violation is 23514, surfaced in meta.code.
  const err = thrown as Prisma.PrismaClientKnownRequestError;
  expect(err.code).toBe("P2010");
  expect(String((err.meta as { code?: string } | undefined)?.code)).toBe("23514");
}

describe("availability capacity CHECK constraints (database-level)", () => {
  it("rejects capacity <= 0 at the database", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id);

    await expectCheckViolation(() =>
      prisma.$executeRaw`INSERT INTO "availabilities"
        (id, workspace_id, tour_id, starts_at, ends_at, capacity, booked_count, status, created_at, updated_at)
        VALUES (${"chk_" + Date.now()}, ${workspace.id}, ${tour.id}, now(), now(), 0, 0, 'scheduled', now(), now())`,
    );
  });

  it("rejects a negative booked_count at the database", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id);
    const availability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        capacity: 5,
      },
    });

    await expectCheckViolation(
      () =>
        prisma.$executeRaw`UPDATE "availabilities" SET booked_count = -1 WHERE id = ${availability.id}`,
    );
  });

  it("rejects booked_count > capacity at the database", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id);
    const availability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        capacity: 5,
      },
    });

    await expectCheckViolation(
      () =>
        prisma.$executeRaw`UPDATE "availabilities" SET booked_count = 6 WHERE id = ${availability.id}`,
    );
  });

  it("allows booked_count == capacity (fully booked is valid)", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id);
    const availability = await prisma.availability.create({
      data: {
        workspaceId: workspace.id,
        tourId: tour.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        capacity: 5,
      },
    });

    await prisma.$executeRaw`UPDATE "availabilities" SET booked_count = 5 WHERE id = ${availability.id}`;
    const updated = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updated.bookedCount).toBe(5);
  });
});
