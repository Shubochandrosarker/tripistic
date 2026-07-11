import { prisma } from "@/lib/db";
import { sendBookingReminderEmail } from "./service";

/**
 * Every confirmed booking whose departure is within the next 24 hours (and
 * hasn't already happened) with no already-`sent` reminder message. Using
 * "within the next 24 hours" rather than a narrow T-24h-exactly window
 * makes correctness independent of how often the sweep actually runs — as
 * long as it runs more than once before a given departure, nothing is
 * missed or double-sent; the "no existing sent reminder" check (not the
 * time window) is what prevents a duplicate.
 */
export async function findDueReminderBookingIds(now: Date = new Date()): Promise<string[]> {
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const bookings = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      departureStartsAt: { gt: now, lte: in24Hours },
      messages: { none: { templateKey: "booking_reminder", status: "sent" } },
    },
    select: { id: true },
  });
  return bookings.map((b) => b.id);
}

/** The body of `POST /api/admin/messages/sweep` — also callable directly from a test or a future scheduler. */
export async function sendDueReminders(): Promise<{ scanned: number; sent: number }> {
  const ids = await findDueReminderBookingIds();
  for (const id of ids) {
    await sendBookingReminderEmail(id);
  }
  if (ids.length === 0) return { scanned: 0, sent: 0 };

  // sendBookingReminderEmail never throws/reports its own outcome (see
  // lib/messaging/service.ts) — re-query the Message rows it just wrote to
  // report an accurate count rather than assuming every attempt succeeded.
  const sent = await prisma.message.count({
    where: { bookingId: { in: ids }, templateKey: "booking_reminder", status: "sent" },
  });
  return { scanned: ids.length, sent };
}
