import { prisma } from "@/lib/db";
import type { ItineraryItemTypeValue } from "@/lib/constants";

/**
 * Rule-based itinerary generator — "AI Itinerary Builder" (docs Phase 11
 * spec: prompt "Create a 9 Day Laos Tour" → full day-by-day plan). This is
 * deterministic generation over the workspace's OWN tour/vendor inventory
 * plus a documented baseline-cost table, not an LLM call — no AI provider
 * is configured anywhere in this codebase yet (.env.example: "AI providers
 * — placeholders only for now"), and the rest of the app's AI-flavored
 * features (app/dashboard/ai-growth) follow the same "rules first, never
 * invented numbers" principle. Every generated line item's cost is either
 * a real Tour.basePrice from the catalog or a clearly-scaled baseline
 * estimate — nothing is fabricated as if it were real vendor pricing.
 */

const TIER_MULTIPLIER: Record<"budget" | "standard" | "premium", number> = {
  budget: 0.75,
  standard: 1,
  premium: 1.6,
};

/** Per-traveler baseline costs (cents) at the `standard` tier — scaled by TIER_MULTIPLIER. */
const BASELINE_CENTS: Record<"accommodation" | "meal" | "activity" | "transfer", number> = {
  accommodation: 5000,
  meal: 1200,
  activity: 3500,
  transfer: 1500,
};

/** Margin applied to baseline/vendor-sourced items only — an item sourced from the workspace's own Tour keeps that tour's real basePrice as both cost and price (no double markup on the operator's own rate). */
const MARKUP_MULTIPLIER = 1.25;

export type GeneratedItem = {
  dayNumber: number;
  type: ItineraryItemTypeValue;
  title: string;
  description?: string;
  startTime?: string;
  tourId?: string;
  vendorId?: string;
  costCents: number;
  priceCents: number;
};

export type GeneratedDay = { dayNumber: number; title: string };

export type GeneratedItinerary = {
  days: GeneratedDay[];
  items: GeneratedItem[];
  totalCostCents: number;
  totalPriceCents: number;
};

export type GenerateItineraryInput = {
  workspaceId: string;
  destination?: string;
  dayCount: number;
  travelerCount: number;
  budgetTier: "budget" | "standard" | "premium";
};

function baseline(kind: keyof typeof BASELINE_CENTS, travelers: number, tier: "budget" | "standard" | "premium"): number {
  return Math.round(BASELINE_CENTS[kind] * TIER_MULTIPLIER[tier] * travelers);
}

export async function generateItineraryPlan(input: GenerateItineraryInput): Promise<GeneratedItinerary> {
  const { workspaceId, destination, dayCount, travelerCount, budgetTier } = input;

  const [tours, vendors] = await Promise.all([
    prisma.tour.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        status: "active",
        ...(destination
          ? { OR: [{ location: { contains: destination, mode: "insensitive" } }, { title: { contains: destination, mode: "insensitive" } }] }
          : {}),
      },
      select: { id: true, title: true, location: true, basePrice: true, currency: true, durationMinutes: true },
      take: 20,
    }),
    prisma.vendor.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        isActive: true,
        ...(destination ? { country: { contains: destination, mode: "insensitive" } } : {}),
      },
      select: { id: true, name: true, kind: true },
      take: 20,
    }),
  ]);

  const hotels = vendors.filter((v) => v.kind === "hotel");
  const restaurants = vendors.filter((v) => v.kind === "restaurant");
  const activityVendors = vendors.filter((v) => v.kind === "activity_provider");
  const transportVendors = vendors.filter((v) => v.kind === "transport");

  const days: GeneratedDay[] = [];
  const items: GeneratedItem[] = [];
  let tourCursor = 0;

  function nextTour() {
    if (tours.length === 0) return null;
    const tour = tours[tourCursor % tours.length];
    tourCursor += 1;
    return tour;
  }

  function pushBaselineOrVendor(
    dayNumber: number,
    type: ItineraryItemTypeValue,
    kind: keyof typeof BASELINE_CENTS,
    title: string,
    startTime: string,
    vendorPool: { id: string; name: string }[],
    vendorIndex: number,
  ) {
    const cost = baseline(kind, travelerCount, budgetTier);
    const vendor = vendorPool.length > 0 ? vendorPool[vendorIndex % vendorPool.length] : null;
    items.push({
      dayNumber,
      type,
      title: vendor ? `${title} — ${vendor.name}` : title,
      startTime,
      vendorId: vendor?.id,
      costCents: cost,
      priceCents: Math.round(cost * MARKUP_MULTIPLIER),
    });
  }

  for (let dayNumber = 1; dayNumber <= dayCount; dayNumber++) {
    const isFirst = dayNumber === 1;
    const isLast = dayNumber === dayCount;
    days.push({
      dayNumber,
      title: isFirst ? "Arrival" : isLast ? "Departure" : `Day ${dayNumber}`,
    });

    if (isFirst) {
      pushBaselineOrVendor(dayNumber, "transfer", "transfer", "Airport pickup & transfer", "10:00", transportVendors, dayNumber);
      if (dayCount > 1) {
        pushBaselineOrVendor(dayNumber, "accommodation", "accommodation", "Hotel check-in", "15:00", hotels, dayNumber);
      }
      pushBaselineOrVendor(dayNumber, "meal", "meal", "Welcome dinner", "19:00", restaurants, dayNumber);
      continue;
    }

    if (isLast) {
      pushBaselineOrVendor(dayNumber, "meal", "meal", "Breakfast", "08:00", restaurants, dayNumber);
      pushBaselineOrVendor(dayNumber, "transfer", "transfer", "Airport drop-off", "12:00", transportVendors, dayNumber);
      continue;
    }

    // A middle day: prefer the workspace's own tour catalog for the day's
    // main activity — real title, real price, no markup on the operator's
    // own rate. Falls back to a vendor-sourced or baseline activity when
    // the catalog is empty or exhausted for variety.
    const tour = nextTour();
    if (tour) {
      items.push({
        dayNumber,
        type: "activity",
        title: tour.title,
        description: tour.location ? `At ${tour.location}` : undefined,
        startTime: "09:00",
        tourId: tour.id,
        costCents: tour.basePrice * travelerCount,
        priceCents: tour.basePrice * travelerCount,
      });
    } else {
      pushBaselineOrVendor(dayNumber, "activity", "activity", "Full-day guided excursion", "09:00", activityVendors, dayNumber);
    }

    pushBaselineOrVendor(dayNumber, "meal", "meal", "Meals", "12:30", restaurants, dayNumber);
    pushBaselineOrVendor(dayNumber, "accommodation", "accommodation", "Hotel stay", "20:00", hotels, dayNumber);
  }

  const totalCostCents = items.reduce((sum, i) => sum + i.costCents, 0);
  const totalPriceCents = items.reduce((sum, i) => sum + i.priceCents, 0);

  return { days, items, totalCostCents, totalPriceCents };
}
