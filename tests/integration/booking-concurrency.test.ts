import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBooking, type CreateBookingInput } from "@/lib/bookings/service";
import { cancelBooking } from "@/lib/bookings/status-service";
import { createBookableFixture, prisma } from "./helpers";

function requestFor(
  workspaceId: string,
  tourId: string,
  availabilityId: string,
  overrides: Partial<CreateBookingInput> = {},
): CreateBookingInput {
  return {
    workspaceId,
    tourId,
    availabilityId,
    participantCount: 1,
    participants: [{ firstName: "Racer", lastName: "Guest" }],
    guestFirstName: "Racer",
    guestLastName: "Guest",
    guestEmail: `racer-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct",
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("concurrency: atomic capacity reservation under real Postgres contention", () => {
  it("exactly N bookings succeed for N remaining seats when far more requests race for them", async () => {
    const CAPACITY = 3;
    const ATTEMPTS = 12;
    const { workspace, tour, availability } = await createBookableFixture({
      tour: { capacity: CAPACITY },
    });

    const results = await Promise.allSettled(
      Array.from({ length: ATTEMPTS }, () =>
        createBooking(requestFor(workspace.id, tour.id, availability.id)),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(CAPACITY);
    expect(rejected).toHaveLength(ATTEMPTS - CAPACITY);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    }

    const finalAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(finalAvailability.bookedCount).toBe(CAPACITY);
    expect(finalAvailability.bookedCount).toBeLessThanOrEqual(finalAvailability.capacity);

    const bookingCount = await prisma.booking.count({ where: { availabilityId: availability.id } });
    expect(bookingCount).toBe(CAPACITY);
  });

  it("a party size larger than the single remaining seat is rejected, not partially reserved", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { capacity: 2 } });
    // Take one seat, leaving exactly one.
    await createBooking(requestFor(workspace.id, tour.id, availability.id, { participantCount: 1, participants: [{ firstName: "A", lastName: "B" }] }));

    await expect(
      createBooking(
        requestFor(workspace.id, tour.id, availability.id, {
          participantCount: 2,
          participants: [
            { firstName: "C", lastName: "D" },
            { firstName: "E", lastName: "F" },
          ],
        }),
      ),
    ).rejects.toMatchObject({ status: 409 });

    const finalAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(finalAvailability.bookedCount).toBe(1); // unchanged by the rejected attempt
  });

  it("the same idempotency key fired concurrently reserves capacity exactly once", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { capacity: 10 } });
    const key = randomUUID();

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        createBooking(requestFor(workspace.id, tour.id, availability.id, { idempotencyKey: key })),
      ),
    );

    const bookingIds = new Set(results.map((r) => r.booking.id));
    expect(bookingIds.size).toBe(1);
    expect(results.filter((r) => !r.idempotentReplay)).toHaveLength(1);
    expect(results.filter((r) => r.idempotentReplay)).toHaveLength(7);

    const finalAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(finalAvailability.bookedCount).toBe(1);

    const bookingCount = await prisma.booking.count({ where: { availabilityId: availability.id } });
    expect(bookingCount).toBe(1);
  });

  it("concurrent duplicate cancellation releases seats exactly once", async () => {
    const { workspace, availability, tour } = await createBookableFixture({ tour: { capacity: 5 } });
    const { booking } = await createBooking(
      requestFor(workspace.id, tour.id, availability.id, {
        participantCount: 3,
        participants: [
          { firstName: "A", lastName: "A" },
          { firstName: "B", lastName: "B" },
          { firstName: "C", lastName: "C" },
        ],
      }),
    );

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        cancelBooking({ workspaceId: workspace.id, bookingId: booking.id, actor: { kind: "public" } }),
      ),
    );

    const fulfilled = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof cancelBooking>>> => r.status === "fulfilled")
      .map((r) => r.value);
    // Exactly one caller actually performed the transition (or hit the
    // already-cancelled no-op) and observed seatsReleased > 0 exactly once.
    const releases = fulfilled.filter((r) => r.seatsReleased > 0);
    expect(releases).toHaveLength(1);
    expect(releases[0].seatsReleased).toBe(3);

    const finalAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(finalAvailability.bookedCount).toBe(0);
  });
});
