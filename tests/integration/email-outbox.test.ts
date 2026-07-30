import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createBooking } from "@/lib/bookings/service";
import { findDueRetries, recordDeliveryAttempt } from "@/lib/messaging/outbox";
import {
  retryDueMessages,
  retryMessageDelivery,
  sendBookingConfirmationEmail,
} from "@/lib/messaging/service";
import { createBookableFixture, prisma } from "./helpers";

/**
 * docs/FINAL-LAUNCH-AUDIT.md §5 — transactional email had no retry.
 *
 * These run with no SMTP configured, which is deliberate rather than a
 * limitation: `getMailer()` throws "SMTP_HOST is not configured", the outbox
 * classifies that as transient, and the message lands in `pending_retry`.
 * That is the same path a real provider outage takes, and it is also the
 * literal state of a fresh deployment before email is wired up — the case
 * where losing confirmations would hurt most.
 */

async function bookingFixture() {
  const fixture = await createBookableFixture({ tour: { basePrice: 5000, capacity: 10 } });
  const { booking } = await createBooking({
    workspaceId: fixture.workspace.id,
    tourId: fixture.tour.id,
    availabilityId: fixture.availability.id,
    participantCount: 1,
    participants: [{ firstName: "A", lastName: "Guest" }],
    guestFirstName: "A",
    guestLastName: "Guest",
    guestEmail: `outbox-${randomUUID()}@example.com`,
    addons: [],
    source: "public_direct",
    requirePublicVisibility: true,
    idempotencyKey: randomUUID(),
  });
  return { ...fixture, booking };
}

async function messagesFor(bookingId: string) {
  return prisma.message.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } });
}

describe("a failed send is retried, not lost", () => {
  it("schedules a retry instead of writing a terminal failure", async () => {
    const { booking } = await bookingFixture();

    await sendBookingConfirmationEmail(booking.id);

    const [message] = await messagesFor(booking.id);
    expect(message).toBeDefined();
    // Before the outbox this row read `failed` and nothing ever looked at it
    // again — the guest's only notice of a booking they paid for was gone.
    expect(message.status).toBe("pending_retry");
    expect(message.attempts).toBe(1);
    expect(message.nextRetryAt).not.toBeNull();
    expect(message.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("keeps the rendered body so the retry has something to send", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);

    const [message] = await messagesFor(booking.id);
    const payload = message.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ to: booking.guestEmail });
    expect(typeof payload.subject).toBe("string");
    expect(typeof payload.html).toBe("string");
  });

  it("does not retry before its backoff has elapsed", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [message] = await messagesFor(booking.id);

    const dueNow = await findDueRetries(new Date());
    expect(dueNow.map((m) => m.id)).not.toContain(message.id);

    const dueLater = await findDueRetries(new Date(Date.now() + 2 * 60 * 60 * 1000));
    expect(dueLater.map((m) => m.id)).toContain(message.id);
  });

  it("re-attempts once the backoff has elapsed and increments the count", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [queued] = await messagesFor(booking.id);

    // Pull the retry into the past rather than waiting a minute.
    const due = await prisma.message.update({
      where: { id: queued.id },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });

    // Drive this one message rather than the global sweep. Test files run
    // concurrently against one shared database, so a platform-wide sweep
    // makes the assertion depend on what other files happen to have queued.
    await retryMessageDelivery(due);

    const after = await prisma.message.findUniqueOrThrow({ where: { id: queued.id } });
    expect(after.attempts).toBe(2);
    expect(after.status).toBe("pending_retry"); // still no SMTP, so still transient
    expect(after.lastAttemptAt).not.toBeNull();
  });

  it("gives up after maxAttempts rather than retrying forever", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [queued] = await messagesFor(booking.id);

    // One attempt short of the budget.
    const due = await prisma.message.update({
      where: { id: queued.id },
      data: { attempts: queued.maxAttempts - 1, nextRetryAt: new Date(Date.now() - 1000) },
    });

    await retryMessageDelivery(due);

    const after = await prisma.message.findUniqueOrThrow({ where: { id: queued.id } });
    expect(after.status).toBe("failed");
    expect(after.nextRetryAt).toBeNull();
    // The body is dropped on a terminal outcome — no reason to hold a copy of
    // guest PII for a message that can never be sent.
    expect(after.payload).toBeNull();
  });

  it("stops immediately on a permanent rejection without burning the budget", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [queued] = await messagesFor(booking.id);

    const updated = await recordDeliveryAttempt(queued.id, {
      status: "failed",
      providerMessageId: null,
      errorMessage: "550 5.1.1 The email account that you tried to reach does not exist",
    });

    // Retrying a nonexistent mailbox four more times only delays the moment
    // an operator finds out, and burns sending reputation.
    expect(updated.status).toBe("failed");
    expect(updated.attempts).toBeLessThan(updated.maxAttempts);
    expect(updated.nextRetryAt).toBeNull();
  });
});

describe("a successful send settles cleanly", () => {
  it("marks sent, clears the retry state, and drops the stored body", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [queued] = await messagesFor(booking.id);

    const updated = await recordDeliveryAttempt(queued.id, {
      status: "sent",
      providerMessageId: "<abc@smtp>",
      errorMessage: null,
    });

    expect(updated.status).toBe("sent");
    expect(updated.sentAt).not.toBeNull();
    expect(updated.nextRetryAt).toBeNull();
    expect(updated.errorMessage).toBeNull();
    expect(updated.providerMessageId).toBe("<abc@smtp>");
    expect(updated.payload).toBeNull();
  });
});

describe("deduplication", () => {
  it("never sends the same confirmation twice", async () => {
    const { booking } = await bookingFixture();

    await sendBookingConfirmationEmail(booking.id);
    await sendBookingConfirmationEmail(booking.id);
    await sendBookingConfirmationEmail(booking.id);

    // A booking can reach `confirmed` from three separate code paths, and the
    // retry sweep runs alongside them. One guest, one email.
    expect(await messagesFor(booking.id)).toHaveLength(1);
  });

  it("resolves a concurrent race in the database rather than by luck", async () => {
    const { booking } = await bookingFixture();

    await Promise.all([
      sendBookingConfirmationEmail(booking.id),
      sendBookingConfirmationEmail(booking.id),
      sendBookingConfirmationEmail(booking.id),
      sendBookingConfirmationEmail(booking.id),
    ]);

    expect(await messagesFor(booking.id)).toHaveLength(1);
  });

  it("keeps different bookings independent", async () => {
    const a = await bookingFixture();
    const b = await bookingFixture();

    await sendBookingConfirmationEmail(a.booking.id);
    await sendBookingConfirmationEmail(b.booking.id);

    expect(await messagesFor(a.booking.id)).toHaveLength(1);
    expect(await messagesFor(b.booking.id)).toHaveLength(1);
  });
});

describe("the retry sweep", () => {
  it("does not touch messages that already succeeded or terminally failed", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [queued] = await messagesFor(booking.id);

    await prisma.message.update({
      where: { id: queued.id },
      data: { status: "sent", sentAt: new Date(), nextRetryAt: null },
    });

    const due = await findDueRetries(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(due.map((m) => m.id)).not.toContain(queued.id);
  });

  it("drains oldest-first so a backlog clears in the order guests were affected", async () => {
    const base = Date.now() - 60 * 60 * 1000;
    const created: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { booking } = await bookingFixture();
      await sendBookingConfirmationEmail(booking.id);
      const [message] = await messagesFor(booking.id);
      await prisma.message.update({
        where: { id: message.id },
        // Oldest gets the earliest nextRetryAt.
        data: { nextRetryAt: new Date(base + i * 1000) },
      });
      created.push(message.id);
    }

    const due = await findDueRetries(new Date());
    const ourOrder = due.map((m) => m.id).filter((id) => created.includes(id));
    expect(ourOrder).toEqual(created);
  });

  it("terminally fails a message whose stored body is unusable", async () => {
    const { booking } = await bookingFixture();
    await sendBookingConfirmationEmail(booking.id);
    const [queued] = await messagesFor(booking.id);

    const due = await prisma.message.update({
      where: { id: queued.id },
      // Simulates a row written before the outbox existed.
      data: { payload: { nonsense: true }, nextRetryAt: new Date(Date.now() - 1000) },
    });

    await retryMessageDelivery(due);

    const after = await prisma.message.findUniqueOrThrow({ where: { id: queued.id } });
    // Terminal rather than retried forever against a payload that can never
    // be sent.
    expect(after.status).toBe("failed");
    expect(after.nextRetryAt).toBeNull();
  });

  it("lets one bad message not block the rest of the backlog", async () => {
    const good = await bookingFixture();
    const bad = await bookingFixture();
    await sendBookingConfirmationEmail(good.booking.id);
    await sendBookingConfirmationEmail(bad.booking.id);

    const [goodMessage] = await messagesFor(good.booking.id);
    const [badMessage] = await messagesFor(bad.booking.id);
    await prisma.message.updateMany({
      where: { id: { in: [goodMessage.id, badMessage.id] } },
      data: { nextRetryAt: new Date(Date.now() - 1000) },
    });
    await prisma.message.update({ where: { id: badMessage.id }, data: { payload: { broken: true } } });

    // The one case that genuinely exercises the platform-wide sweep, so it
    // stays. Assertions are confined to this test's own two rows — `scanned`
    // is a lower bound rather than an equality, because other test files
    // share this database and may have their own due messages.
    const outcome = await retryDueMessages();
    expect(outcome.scanned).toBeGreaterThanOrEqual(2);

    const goodAfter = await prisma.message.findUniqueOrThrow({ where: { id: goodMessage.id } });
    const badAfter = await prisma.message.findUniqueOrThrow({ where: { id: badMessage.id } });
    // The bad row is terminal; the good one simply got another attempt, which
    // is the point — one unusable message must not stall the queue behind it.
    expect(badAfter.status).toBe("failed");
    expect(goodAfter.attempts).toBe(2);
    expect(goodAfter.status).toBe("pending_retry");
  });
});
