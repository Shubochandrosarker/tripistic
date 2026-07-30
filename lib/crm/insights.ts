import { prisma } from "@/lib/db";

export type CustomerInsights = {
  lifetimeValueCents: number;
  bookingCount: number;
  completedBookingCount: number;
  cancelledBookingCount: number;
  cancellationRate: number;
  isRepeatCustomer: boolean;
  favoriteTour: { title: string; count: number } | null;
  firstBookedAt: string | null;
  lastBookedAt: string | null;
  aiSummary: string;
};

/**
 * Rule-based per-customer insights for the Customer Dashboard (docs Phase 5
 * spec: CLV, repeat rate, favorite tours, revenue, cancellation %, AI
 * summary). "AI Customer Summary" is deterministic plain-English narration
 * generated from these real numbers — no LLM call is made anywhere in this
 * codebase yet (see app/dashboard/growth's "rules first, AI narration
 * second" precedent); the summary is honest about what it's based on.
 */
export async function computeCustomerInsights(workspaceId: string, customerId: string): Promise<CustomerInsights> {
  const bookings = await prisma.booking.findMany({
    where: { workspaceId, customerId },
    select: {
      status: true,
      totalAmount: true,
      currency: true,
      tourTitleSnapshot: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const revenueBookings = bookings.filter((b) => b.status === "completed" || b.status === "confirmed");
  const lifetimeValueCents = revenueBookings.reduce((sum, b) => sum + b.totalAmount, 0);
  const cancelledBookingCount = bookings.filter((b) => b.status === "cancelled").length;
  const completedBookingCount = bookings.filter((b) => b.status === "completed").length;
  const cancellationRate = bookings.length > 0 ? cancelledBookingCount / bookings.length : 0;

  const tourCounts = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    tourCounts.set(b.tourTitleSnapshot, (tourCounts.get(b.tourTitleSnapshot) ?? 0) + 1);
  }
  let favoriteTour: CustomerInsights["favoriteTour"] = null;
  for (const [title, count] of tourCounts) {
    if (!favoriteTour || count > favoriteTour.count) favoriteTour = { title, count };
  }

  const currency = bookings[0]?.currency ?? "USD";
  const isRepeatCustomer = bookings.filter((b) => b.status !== "cancelled").length > 1;

  const aiSummary = buildAiSummary({
    bookingCount: bookings.length,
    isRepeatCustomer,
    lifetimeValueCents,
    currency,
    cancellationRate,
    favoriteTour,
  });

  return {
    lifetimeValueCents,
    bookingCount: bookings.length,
    completedBookingCount,
    cancelledBookingCount,
    cancellationRate,
    isRepeatCustomer,
    favoriteTour,
    firstBookedAt: bookings[0]?.createdAt.toISOString() ?? null,
    lastBookedAt: bookings.length > 0 ? bookings[bookings.length - 1].createdAt.toISOString() : null,
    aiSummary,
  };
}

function formatMoneySimple(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function buildAiSummary(input: {
  bookingCount: number;
  isRepeatCustomer: boolean;
  lifetimeValueCents: number;
  currency: string;
  cancellationRate: number;
  favoriteTour: { title: string; count: number } | null;
}): string {
  if (input.bookingCount === 0) {
    return "No bookings yet — this profile was created from a lead or manual entry.";
  }

  const parts: string[] = [];
  parts.push(
    input.isRepeatCustomer
      ? `Repeat guest with ${input.bookingCount} booking${input.bookingCount === 1 ? "" : "s"} and ${formatMoneySimple(input.lifetimeValueCents, input.currency)} in lifetime value.`
      : `First-time guest, ${formatMoneySimple(input.lifetimeValueCents, input.currency)} in lifetime value so far.`,
  );
  if (input.favoriteTour) {
    parts.push(`Favorite tour: ${input.favoriteTour.title} (booked ${input.favoriteTour.count} time${input.favoriteTour.count === 1 ? "" : "s"}).`);
  }
  if (input.cancellationRate > 0) {
    parts.push(`${Math.round(input.cancellationRate * 100)}% of their bookings were cancelled.`);
  } else if (input.bookingCount > 0) {
    parts.push("No cancellations on record.");
  }
  return parts.join(" ");
}
