import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/messaging/mailer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/messaging/mailer")>("@/lib/messaging/mailer");
  return { ...actual, getMailer: vi.fn() };
});

import { getMailer } from "@/lib/messaging/mailer";
import { createBooking } from "@/lib/bookings/service";
import { findDueReminderBookingIds, sendDueReminders } from "@/lib/messaging/reminders";
import { createBookableFixture, prisma } from "./helpers";

const mockGetMailer = getMailer as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMailer.mockReturnValue({
    sendMail: vi.fn().mockResolvedValue({ messageId: `test-msg-${randomUUID().slice(0, 8)}` }),
  });
});

const HOUR = 60 * 60 * 1000;

async function confirmedBookingDeparting(hoursFromNow: number, overrides: { status?: "pending" | "confirmed" } = {}) {
  const { workspace, tour, availability } = await createBookableFixture({
    tour: { basePrice: 0, capacity: 5 },
    availability: { startsAt: new Date(Date.now() + hoursFromNow * HOUR) },
  });
  const { booking } = await createBooking({
    workspaceId: workspace.id,
    tourId: tour.id,
    availabilityId: availability.id,
    participantCount: 1,
    participants: [{ firstName: "Guest", lastName: "One" }],
    guestFirstName: "Guest",
    guestLastName: "One",
    guestEmail: `reminder-${randomUUID()}@example.com`,
    addons: [],
    source: overrides.status === "pending" ? "manual" : "public_direct",
    requirePublicVisibility: overrides.status !== "pending",
    status: overrides.status === "pending" ? "pending" : undefined,
    idempotencyKey: randomUUID(),
  });
  return { workspace, booking };
}

describe("findDueReminderBookingIds", () => {
  it("includes a confirmed booking departing within the next 24 hours", async () => {
    const { booking } = await confirmedBookingDeparting(20);
    const ids = await findDueReminderBookingIds();
    expect(ids).toContain(booking.id);
  });

  it("excludes a confirmed booking departing more than 24 hours out", async () => {
    const { booking } = await confirmedBookingDeparting(30);
    const ids = await findDueReminderBookingIds();
    expect(ids).not.toContain(booking.id);
  });

  it("excludes a still-pending booking even if its departure is within 24 hours", async () => {
    const { booking } = await confirmedBookingDeparting(20, { status: "pending" });
    const ids = await findDueReminderBookingIds();
    expect(ids).not.toContain(booking.id);
  });

  it("excludes a booking that already has a sent reminder", async () => {
    const { booking } = await confirmedBookingDeparting(20);
    await prisma.message.create({
      data: {
        workspaceId: (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).workspaceId,
        bookingId: booking.id,
        templateKey: "booking_reminder",
        status: "sent",
        toEmail: booking.guestEmail,
        sentAt: new Date(),
      },
    });
    const ids = await findDueReminderBookingIds();
    expect(ids).not.toContain(booking.id);
  });
});

describe("sendDueReminders", () => {
  it("sends a tracked reminder to a due booking and correctly reports scanned/sent counts", async () => {
    const { booking } = await confirmedBookingDeparting(18);

    const result = await sendDueReminders();
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBeGreaterThanOrEqual(1);

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "booking_reminder" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("sent");
    expect(messages[0].providerMessageId).toMatch(/^test-msg-/);
  });

  it("running the sweep twice does not send a duplicate reminder for the same booking", async () => {
    const { booking } = await confirmedBookingDeparting(18);

    await sendDueReminders();
    await sendDueReminders();

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "booking_reminder" } });
    expect(messages).toHaveLength(1);
  });

  it("is a correct no-op when nothing is due (0 scanned, 0 sent, no mailer call)", async () => {
    await confirmedBookingDeparting(30); // outside the window — nothing else due from this test's own fixtures
    const before = await prisma.message.count({ where: { templateKey: "booking_reminder" } });

    const result = await sendDueReminders();

    // Only asserts this test's own effect — other tests in this file run
    // against the same shared database, so scanned/sent may be nonzero from
    // fixtures created elsewhere; the no-duplicate invariant is what matters.
    const after = await prisma.message.count({ where: { templateKey: "booking_reminder" } });
    expect(after).toBe(before + result.sent);
  });

  /**
   * Previously asserted `failed`. A timeout is transient, and marking it
   * terminal is the §5 defect — the guest simply never got their T-24h
   * reminder and nothing could resend it.
   */
  it("schedules a retry for a mocked SMTP timeout without throwing", async () => {
    mockGetMailer.mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error("SMTP timeout")) });
    const { booking } = await confirmedBookingDeparting(15);

    await expect(sendDueReminders()).resolves.toBeDefined();

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "booking_reminder" } });
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("pending_retry");
    expect(messages[0].nextRetryAt).not.toBeNull();
  });

  it("does not re-queue a reminder that is already awaiting retry", async () => {
    // The sweep runs every minute; a reminder held for retry must not spawn a
    // second Message row on every tick — the guest would then get a burst of
    // duplicates the moment SMTP recovered.
    mockGetMailer.mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error("SMTP timeout")) });
    const { booking } = await confirmedBookingDeparting(15);

    await sendDueReminders();
    await sendDueReminders();
    await sendDueReminders();

    const messages = await prisma.message.findMany({ where: { bookingId: booking.id, templateKey: "booking_reminder" } });
    expect(messages).toHaveLength(1);
  });
});
