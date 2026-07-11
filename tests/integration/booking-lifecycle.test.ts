import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBooking } from "@/lib/bookings/service";
import { cancelBooking, transitionBookingStatus } from "@/lib/bookings/status-service";
import { ApiError } from "@/lib/api";
import {
  createBookableFixture,
  createTestAvailability,
  createTestTour,
  createTestUser,
  createTestWorkspace,
  prisma,
  uniqueSuffix,
} from "./helpers";

function baseInput(availabilityId: string, tourId: string, workspaceId: string, overrides: Partial<Parameters<typeof createBooking>[0]> = {}) {
  return {
    workspaceId,
    tourId,
    availabilityId,
    participantCount: 2,
    participants: [
      { firstName: "Lead", lastName: "Guest" },
      { firstName: "Second", lastName: "Guest" },
    ],
    guestFirstName: "Lead",
    guestLastName: "Guest",
    guestEmail: `guest-${uniqueSuffix()}@example.com`,
    addons: [] as { tourAddonId: string; quantity: number }[],
    source: "public_direct" as const,
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("createBooking — canonical reservation service", () => {
  it("creates a booking with participants, computes pricing, and increments booked_count", async () => {
    const { workspace, tour, availability } = await createBookableFixture({
      tour: { basePrice: 5000, capacity: 10 },
    });
    const addon = await prisma.tourAddon.create({
      data: { workspaceId: workspace.id, tourId: tour.id, name: "Snacks", price: 500 },
    });

    const { booking, idempotentReplay } = await createBooking(
      baseInput(availability.id, tour.id, workspace.id, {
        addons: [{ tourAddonId: addon.id, quantity: 2 }],
      }),
    );

    expect(idempotentReplay).toBe(false);
    expect(booking.status).toBe("confirmed");
    expect(booking.unitPrice).toBe(5000);
    expect(booking.subtotal).toBe(10000); // 5000 * 2 participants
    expect(booking.addonsTotal).toBe(1000); // 500 * 2
    expect(booking.totalAmount).toBe(11000);
    expect(booking.participants).toHaveLength(2);
    expect(booking.participants[0].isLead).toBe(true);
    expect(booking.addonSelections).toHaveLength(1);
    expect(booking.reference).toMatch(/^[A-Z0-9]{8}$/);
    expect(booking.publicToken.length).toBeGreaterThan(20);

    const updatedAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(updatedAvailability.bookedCount).toBe(2);

    const events = await prisma.bookingStatusEvent.findMany({ where: { bookingId: booking.id } });
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe("confirmed");
    expect(events[0].fromStatus).toBeNull();
  });

  it("rejects a participant array that doesn't match participantCount", async () => {
    const { workspace, tour, availability } = await createBookableFixture();
    await expect(
      createBooking(
        baseInput(availability.id, tour.id, workspace.id, {
          participantCount: 3,
          participants: [{ firstName: "Only", lastName: "One" }],
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects booking a private tour through the public path", async () => {
    const { workspace, tour, availability } = await createBookableFixture({
      tour: { visibility: "private" },
    });
    await expect(
      createBooking(baseInput(availability.id, tour.id, workspace.id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("allows booking a private tour through the manual (operator) path", async () => {
    const { workspace, tour, availability } = await createBookableFixture({
      tour: { visibility: "private" },
    });
    const { booking } = await createBooking(
      baseInput(availability.id, tour.id, workspace.id, {
        source: "manual",
        requirePublicVisibility: false,
        idempotencyKey: undefined,
      }),
    );
    expect(booking.status).toBe("confirmed");
    expect(booking.source).toBe("manual");
  });

  it("rejects a departure that has already started", async () => {
    const owner = await createTestUser();
    const workspace = await createTestWorkspace(owner.id);
    const tour = await createTestTour(workspace.id);
    const pastAvailability = await createTestAvailability(tour, {
      startsAt: new Date(Date.now() - 3600_000),
    });
    await expect(
      createBooking(baseInput(pastAvailability.id, tour.id, workspace.id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an availability from a different tour/workspace (cross-tenant injection)", async () => {
    const { workspace: workspaceA, tour: tourA } = await createBookableFixture();
    const { availability: availabilityB } = await createBookableFixture();

    await expect(
      createBooking(baseInput(availabilityB.id, tourA.id, workspaceA.id)),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("ignores unknown/forged fields on the input beyond the typed contract", async () => {
    const { workspace, tour, availability } = await createBookableFixture({
      tour: { basePrice: 7000 },
    });
    const forged = {
      ...baseInput(availability.id, tour.id, workspace.id),
      totalAmount: 1,
      unitPrice: 1,
      currency: "ZZZ",
      status: "completed",
      reference: "HACKED01",
    };
    const { booking } = await createBooking(forged as unknown as Parameters<typeof createBooking>[0]);
    expect(booking.unitPrice).toBe(7000);
    expect(booking.totalAmount).toBe(14000);
    expect(booking.currency).toBe("USD");
    expect(booking.status).toBe("confirmed");
    expect(booking.reference).not.toBe("HACKED01");
  });

  it("is idempotent: the same idempotency key returns the original booking without a second reservation", async () => {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { capacity: 5 } });
    const key = randomUUID();

    const first = await createBooking(baseInput(availability.id, tour.id, workspace.id, { idempotencyKey: key }));
    const second = await createBooking(baseInput(availability.id, tour.id, workspace.id, { idempotencyKey: key }));

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.booking.id).toBe(first.booking.id);

    const updated = await prisma.availability.findUniqueOrThrow({ where: { id: availability.id } });
    expect(updated.bookedCount).toBe(2); // reserved once, not twice
  });
});

describe("transitionBookingStatus / cancelBooking", () => {
  async function createConfirmedBooking(participantCount = 2) {
    const { workspace, tour, availability } = await createBookableFixture({ tour: { capacity: 10 } });
    const { booking } = await createBooking(
      baseInput(availability.id, tour.id, workspace.id, {
        participantCount,
        participants: Array.from({ length: participantCount }, (_, i) => ({
          firstName: `Guest${i}`,
          lastName: "Test",
        })),
      }),
    );
    return { workspace, tour, availability, booking };
  }

  it("cancellation releases exactly the booked seats", async () => {
    const { workspace, availability, booking } = await createConfirmedBooking(3);

    const result = await cancelBooking({
      workspaceId: workspace.id,
      bookingId: booking.id,
      actor: { kind: "public" },
    });

    expect(result.alreadyInStatus).toBe(false);
    expect(result.seatsReleased).toBe(3);
    expect(result.booking.status).toBe("cancelled");

    const updatedAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(updatedAvailability.bookedCount).toBe(0);
  });

  it("a repeated cancellation is a safe idempotent no-op — no double release", async () => {
    const { workspace, availability, booking } = await createConfirmedBooking(2);

    await cancelBooking({ workspaceId: workspace.id, bookingId: booking.id, actor: { kind: "public" } });
    const second = await cancelBooking({
      workspaceId: workspace.id,
      bookingId: booking.id,
      actor: { kind: "public" },
    });

    expect(second.alreadyInStatus).toBe(true);
    expect(second.seatsReleased).toBe(0);

    const updatedAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(updatedAvailability.bookedCount).toBe(0);
  });

  it("rejects an invalid transition (completed -> cancelled) with 409", async () => {
    const { workspace, booking } = await createConfirmedBooking(1);
    await transitionBookingStatus({
      workspaceId: workspace.id,
      bookingId: booking.id,
      toStatus: "completed",
      actor: { kind: "public" },
    });

    let thrown: unknown = null;
    try {
      await transitionBookingStatus({
        workspaceId: workspace.id,
        bookingId: booking.id,
        toStatus: "cancelled",
        actor: { kind: "public" },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(409);
  });

  it("completed/no_show bookings do not release capacity", async () => {
    const { workspace, availability, booking } = await createConfirmedBooking(2);
    await transitionBookingStatus({
      workspaceId: workspace.id,
      bookingId: booking.id,
      toStatus: "completed",
      actor: { kind: "public" },
    });
    const updatedAvailability = await prisma.availability.findUniqueOrThrow({
      where: { id: availability.id },
    });
    expect(updatedAvailability.bookedCount).toBe(2); // unchanged
  });

  it("rejects a status transition for a booking in a different workspace", async () => {
    const { booking } = await createConfirmedBooking(1);
    const otherOwner = await createTestUser();
    const otherWorkspace = await createTestWorkspace(otherOwner.id);

    await expect(
      transitionBookingStatus({
        workspaceId: otherWorkspace.id,
        bookingId: booking.id,
        toStatus: "cancelled",
        actor: { kind: "public" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
