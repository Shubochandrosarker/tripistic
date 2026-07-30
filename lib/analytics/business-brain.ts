import { prisma } from "@/lib/db";
import {
  BUSINESS_BRAIN_FORECAST_MONTHS,
  BUSINESS_BRAIN_HISTORY_MONTHS,
  DAYS_OF_WEEK,
  HIGH_OCCUPANCY_THRESHOLD,
  LOW_OCCUPANCY_THRESHOLD,
  VEHICLE_EXPIRY_WARNING_DAYS,
} from "@/lib/constants";
import { listUnpaidInvoicesAcrossWorkspace } from "@/lib/vendors/service";
import { formatMoney } from "@/lib/utils";

/**
 * Growth Insights (docs Phase 12 spec) — every number here is computed
 * directly from the workspace's own data with a documented formula, never
 * an LLM call (no AI provider is configured anywhere in this codebase —
 * see .env.example). This is the same "rules first, honest narration
 * second" principle app/dashboard/growth has stated since Phase 1,
 * finally implemented for real.
 */

export type MonthlyRevenuePoint = { month: string; revenueCents: number; forecast?: boolean };
export type WeekdayOccupancy = { weekday: number; label: string; avgOccupancyPct: number; departureCount: number };

export type BusinessBrainReport = {
  hasEnoughData: boolean;
  revenueHistory: MonthlyRevenuePoint[];
  revenueForecast: MonthlyRevenuePoint[];
  occupancyByWeekday: WeekdayOccupancy[];
  cancellationRatePct: number;
  repeatCustomerRatePct: number;
  directBookingSharePct: number;
  pricingSuggestions: string[];
  marketingIdeas: string[];
  inventoryWarnings: string[];
  staffSuggestions: string[];
  riskAlerts: string[];
  growthScore: number;
  healthScore: number;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export async function computeBusinessBrainReport(workspaceId: string): Promise<BusinessBrainReport> {
  const now = new Date();
  const historyStart = new Date(now);
  historyStart.setUTCMonth(historyStart.getUTCMonth() - (BUSINESS_BRAIN_HISTORY_MONTHS - 1));
  historyStart.setUTCDate(1);
  historyStart.setUTCHours(0, 0, 0, 0);

  const [
    payments,
    bookings,
    customerBookingCounts,
    upcomingAvailabilities,
    pastAvailabilities,
    toursWithoutUpcoming,
    unassignedUpcoming,
    unpaidInvoices,
    expiringVehicles,
  ] = await Promise.all([
    prisma.payment.findMany({
      where: { workspaceId, status: "succeeded", createdAt: { gte: historyStart } },
      select: { amount: true, createdAt: true },
    }),
    prisma.booking.findMany({
      where: { workspaceId },
      select: { status: true, source: true, customerId: true },
    }),
    prisma.customer.findMany({
      where: { workspaceId, deletedAt: null },
      select: { _count: { select: { bookings: true } } },
    }),
    prisma.availability.findMany({
      where: {
        workspaceId,
        status: "scheduled",
        startsAt: { gt: now, lte: new Date(now.getTime() + 14 * 86_400_000) },
      },
      select: { bookedCount: true, capacity: true, tour: { select: { title: true } } },
    }),
    prisma.availability.findMany({
      where: { workspaceId, startsAt: { lt: now, gte: historyStart }, status: { not: "cancelled" } },
      select: { startsAt: true, bookedCount: true, capacity: true },
    }),
    prisma.tour.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "active",
        availabilities: { none: { status: "scheduled", startsAt: { gt: now } } },
      },
      select: { title: true },
    }),
    prisma.availability.findMany({
      where: {
        workspaceId,
        status: "scheduled",
        guideId: null,
        startsAt: { gt: now, lte: new Date(now.getTime() + 7 * 86_400_000) },
      },
      select: { id: true, startsAt: true, tour: { select: { title: true } } },
    }),
    listUnpaidInvoicesAcrossWorkspace(workspaceId),
    prisma.vehicle.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        OR: [
          { insuranceExpiresOn: { lte: new Date(now.getTime() + VEHICLE_EXPIRY_WARNING_DAYS * 86_400_000) } },
          { registrationExpiresOn: { lte: new Date(now.getTime() + VEHICLE_EXPIRY_WARNING_DAYS * 86_400_000) } },
        ],
      },
      select: { name: true, insuranceExpiresOn: true, registrationExpiresOn: true },
    }),
  ]);

  const hasEnoughData = bookings.length > 0;

  // --- Revenue history + forecast (simple trailing weighted moving average) ---
  const revenueByMonth = new Map<string, number>();
  for (const p of payments) revenueByMonth.set(monthKey(p.createdAt), (revenueByMonth.get(monthKey(p.createdAt)) ?? 0) + p.amount);

  const revenueHistory: MonthlyRevenuePoint[] = [];
  for (let i = BUSINESS_BRAIN_HISTORY_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = monthKey(d);
    revenueHistory.push({ month: monthLabel(key), revenueCents: revenueByMonth.get(key) ?? 0 });
  }

  const recentWindow = revenueHistory.slice(-3).map((p) => p.revenueCents);
  const avgRecent = recentWindow.length > 0 ? recentWindow.reduce((a, b) => a + b, 0) / recentWindow.length : 0;
  const revenueForecast: MonthlyRevenuePoint[] = [];
  for (let i = 1; i <= BUSINESS_BRAIN_FORECAST_MONTHS; i++) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() + i);
    revenueForecast.push({ month: monthLabel(monthKey(d)), revenueCents: Math.round(avgRecent), forecast: true });
  }

  // --- Occupancy by weekday ---
  const weekdayBuckets = new Map<number, { sum: number; count: number }>();
  for (const a of pastAvailabilities) {
    if (a.capacity <= 0) continue;
    const weekday = a.startsAt.getUTCDay();
    const occupancyPct = (a.bookedCount / a.capacity) * 100;
    const bucket = weekdayBuckets.get(weekday) ?? { sum: 0, count: 0 };
    bucket.sum += occupancyPct;
    bucket.count += 1;
    weekdayBuckets.set(weekday, bucket);
  }
  const occupancyByWeekday: WeekdayOccupancy[] = DAYS_OF_WEEK.map((d) => {
    const bucket = weekdayBuckets.get(d.value);
    return {
      weekday: d.value,
      label: d.label,
      avgOccupancyPct: bucket && bucket.count > 0 ? Math.round(bucket.sum / bucket.count) : 0,
      departureCount: bucket?.count ?? 0,
    };
  });

  // --- Core rates ---
  const cancelledCount = bookings.filter((b) => b.status === "cancelled").length;
  const cancellationRatePct = bookings.length > 0 ? Math.round((cancelledCount / bookings.length) * 100) : 0;

  const repeatCustomers = customerBookingCounts.filter((c) => c._count.bookings > 1).length;
  const repeatCustomerRatePct =
    customerBookingCounts.length > 0 ? Math.round((repeatCustomers / customerBookingCounts.length) * 100) : 0;

  const directBookings = bookings.filter((b) => b.source === "public_direct").length;
  const directBookingSharePct = bookings.length > 0 ? Math.round((directBookings / bookings.length) * 100) : 0;

  // --- Suggestions (rule-based, derived directly from the occupancy table above) ---
  const pricingSuggestions: string[] = [];
  const marketingIdeas: string[] = [];
  for (const day of occupancyByWeekday) {
    if (day.departureCount === 0) continue;
    if (day.avgOccupancyPct <= LOW_OCCUPANCY_THRESHOLD * 100) {
      pricingSuggestions.push(`${day.label} departures average ${day.avgOccupancyPct}% occupancy — consider a 10-15% discount to fill seats.`);
      marketingIdeas.push(`Run a targeted promo for ${day.label} departures — your weakest day at ${day.avgOccupancyPct}% average occupancy.`);
    } else if (day.avgOccupancyPct >= HIGH_OCCUPANCY_THRESHOLD * 100) {
      pricingSuggestions.push(`${day.label} departures average ${day.avgOccupancyPct}% occupancy — there's room to raise the price.`);
    }
  }
  if (directBookingSharePct < 50 && bookings.length >= 5) {
    marketingIdeas.push(`Only ${directBookingSharePct}% of bookings are direct — feature your booking link more prominently to keep more margin.`);
  }

  const inventoryWarnings: string[] = [];
  for (const a of upcomingAvailabilities) {
    if (a.capacity > 0 && a.bookedCount / a.capacity >= HIGH_OCCUPANCY_THRESHOLD) {
      inventoryWarnings.push(`${a.tour.title} is ${Math.round((a.bookedCount / a.capacity) * 100)}% booked in the next 14 days — add more capacity or departures.`);
    }
  }
  for (const t of toursWithoutUpcoming) {
    inventoryWarnings.push(`${t.title} has no upcoming departures scheduled.`);
  }

  const staffSuggestions = unassignedUpcoming.map(
    (a) => `${a.tour.title} on ${a.startsAt.toISOString().slice(0, 10)} has no guide assigned yet.`,
  );

  const riskAlerts: string[] = [];
  for (const invoice of unpaidInvoices.slice(0, 10)) {
    riskAlerts.push(
      `${invoice.vendor.name} invoice for ${formatMoney(invoice.amountCents, invoice.currency)} is ${invoice.status === "overdue" ? "overdue" : "unpaid"}.`,
    );
  }
  for (const vehicle of expiringVehicles) {
    if (vehicle.insuranceExpiresOn) riskAlerts.push(`${vehicle.name}'s insurance expires ${vehicle.insuranceExpiresOn.toISOString().slice(0, 10)}.`);
    if (vehicle.registrationExpiresOn) riskAlerts.push(`${vehicle.name}'s registration expires ${vehicle.registrationExpiresOn.toISOString().slice(0, 10)}.`);
  }

  // --- Composite scores (0-100, transparent weighted formula — not a black box) ---
  const avgOccupancyOverall =
    occupancyByWeekday.filter((d) => d.departureCount > 0).reduce((sum, d, _i, arr) => sum + d.avgOccupancyPct / arr.length, 0) || 0;
  const onTimeRateProxy = Math.max(0, 100 - riskAlerts.length * 10);

  const healthScore = hasEnoughData
    ? Math.round(
        avgOccupancyOverall * 0.35 +
          (100 - cancellationRatePct) * 0.25 +
          repeatCustomerRatePct * 0.2 +
          onTimeRateProxy * 0.2,
      )
    : 0;

  const growthScore = hasEnoughData
    ? Math.round(directBookingSharePct * 0.3 + repeatCustomerRatePct * 0.4 + Math.min(avgRecent > 0 ? 100 : 0, 100) * 0.3)
    : 0;

  return {
    hasEnoughData,
    revenueHistory,
    revenueForecast,
    occupancyByWeekday,
    cancellationRatePct,
    repeatCustomerRatePct,
    directBookingSharePct,
    pricingSuggestions,
    marketingIdeas,
    inventoryWarnings,
    staffSuggestions,
    riskAlerts,
    growthScore: Math.max(0, Math.min(100, growthScore)),
    healthScore: Math.max(0, Math.min(100, healthScore)),
  };
}
