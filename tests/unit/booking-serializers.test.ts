import { describe, expect, it } from "vitest";
import {
  serializeBookingDetail,
  serializeBookingListItem,
  serializePublicBookingConfirmation,
} from "@/lib/bookings/serializers";
import type { BookingWithRelations } from "@/lib/bookings/service";

function fakeBooking(): BookingWithRelations {
  return {
    id: "booking_1",
    workspaceId: "ws_1",
    tourId: "tour_1",
    availabilityId: "avail_1",
    reference: "ABC23456",
    publicToken: "super-secret-token-value",
    idempotencyKey: null,
    source: "public_direct",
    status: "confirmed",
    guestFirstName: "Jane",
    guestLastName: "Doe",
    guestEmail: "jane@example.com",
    guestPhone: "+1-555-0100",
    guestNotes: "Allergic to peanuts",
    operatorNotes: "Called twice, VIP guest",
    participantCount: 2,
    tourTitleSnapshot: "Desert Jeep Tour",
    locationSnapshot: "Sedona, AZ",
    meetingPointSnapshot: "North gate",
    departureStartsAt: new Date("2026-08-01T16:00:00Z"),
    departureEndsAt: new Date("2026-08-01T18:00:00Z"),
    unitPrice: 5000,
    subtotal: 10000,
    addonsTotal: 500,
    totalAmount: 10500,
    currency: "USD",
    cancellationPolicySnapshot: "Free cancellation up to 24h before.",
    termsAcceptedAt: new Date("2026-07-01T00:00:00Z"),
    confirmedAt: new Date("2026-07-01T00:00:00Z"),
    cancelledAt: null,
    completedAt: null,
    createdById: null,
    customerId: null,
    checkedInAt: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    participants: [
      {
        id: "p1",
        workspaceId: "ws_1",
        bookingId: "booking_1",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "+1-555-0100",
        notes: "Front seat please",
        isLead: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    addonSelections: [
      {
        id: "a1",
        workspaceId: "ws_1",
        bookingId: "booking_1",
        tourAddonId: "addon_1",
        nameSnapshot: "Water & Snacks",
        unitPrice: 500,
        quantity: 1,
        totalPrice: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  };
}

describe("serializePublicBookingConfirmation", () => {
  it("never includes guest email, phone, operator notes, or internal database IDs", () => {
    const result = serializePublicBookingConfirmation(fakeBooking()) as unknown as Record<string, unknown>;
    for (const forbidden of [
      "guestEmail",
      "guestPhone",
      "operatorNotes",
      "id",
      "workspaceId",
      "tourId",
      "availabilityId",
      "idempotencyKey",
      "createdById",
    ]) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it("includes publicToken (needed to address the confirmation page itself) and the safe guest-facing summary fields", () => {
    const result = serializePublicBookingConfirmation(fakeBooking());
    expect(result.reference).toBe("ABC23456");
    expect(result.publicToken).toBe("super-secret-token-value");
    expect(result.tourTitle).toBe("Desert Jeep Tour");
    expect(result.totalAmount).toBe(10500);
    expect(result.participants).toEqual([{ firstName: "Jane", lastName: "Doe" }]);
  });
});

describe("serializeBookingListItem / serializeBookingDetail — role-based redaction", () => {
  it("owner/admin/staff see full guest PII", () => {
    for (const role of ["workspace_owner", "workspace_admin", "staff"] as const) {
      const item = serializeBookingListItem(fakeBooking(), role);
      expect(item.guestEmail).toBe("jane@example.com");
    }
  });

  it("viewer never sees guest email in the list view", () => {
    const item = serializeBookingListItem(fakeBooking(), "viewer");
    expect(item.guestEmail).toBeNull();
  });

  it("viewer detail view redacts phone, notes, operator notes, participant contact info, and the public token", () => {
    const detail = serializeBookingDetail(fakeBooking(), "viewer");
    expect(detail.guestEmail).toBeNull();
    expect(detail.guestPhone).toBeNull();
    expect(detail.guestNotes).toBeNull();
    expect(detail.operatorNotes).toBeNull();
    expect(detail.publicToken).toBeNull();
    expect(detail.participants[0].email).toBeNull();
    expect(detail.participants[0].phone).toBeNull();
    expect(detail.participants[0].notes).toBeNull();
    // Non-sensitive operational fields remain visible.
    expect(detail.participants[0].firstName).toBe("Jane");
    expect(detail.reference).toBe("ABC23456");
    expect(detail.totalAmount).toBe(10500);
  });

  it("staff detail view sees full PII including the public token", () => {
    const detail = serializeBookingDetail(fakeBooking(), "staff");
    expect(detail.guestEmail).toBe("jane@example.com");
    expect(detail.guestPhone).toBe("+1-555-0100");
    expect(detail.operatorNotes).toBe("Called twice, VIP guest");
    expect(detail.publicToken).toBe("super-secret-token-value");
    expect(detail.participants[0].notes).toBe("Front seat please");
  });
});
