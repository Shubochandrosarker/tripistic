import type { Itinerary, ItineraryDay, ItineraryItem } from "@prisma/client";

export function serializeItineraryItem(item: ItineraryItem) {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    description: item.description,
    startTime: item.startTime,
    tourId: item.tourId,
    vendorId: item.vendorId,
    costCents: item.costCents,
    priceCents: item.priceCents,
    marginCents: item.priceCents - item.costCents,
    sortOrder: item.sortOrder,
  };
}

export function serializeItineraryDay(day: ItineraryDay & { items?: ItineraryItem[] }) {
  return {
    id: day.id,
    dayNumber: day.dayNumber,
    date: day.date?.toISOString() ?? null,
    title: day.title,
    notes: day.notes,
    items: (day.items ?? []).map(serializeItineraryItem),
  };
}

type ItineraryDetailSource = Itinerary & {
  days?: (ItineraryDay & { items: ItineraryItem[] })[];
  customer?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
};

export function serializeItinerary(itinerary: ItineraryDetailSource) {
  const days = (itinerary.days ?? []).map(serializeItineraryDay);
  const totalCostCents = days.reduce((sum, d) => sum + d.items.reduce((s, i) => s + i.costCents, 0), 0);
  const totalPriceCents = days.reduce((sum, d) => sum + d.items.reduce((s, i) => s + i.priceCents, 0), 0);

  return {
    id: itinerary.id,
    title: itinerary.title,
    destination: itinerary.destination,
    dayCount: itinerary.dayCount,
    startDate: itinerary.startDate?.toISOString() ?? null,
    travelerCount: itinerary.travelerCount,
    currency: itinerary.currency,
    status: itinerary.status,
    publicToken: itinerary.publicToken,
    customer: itinerary.customer ?? null,
    lead: itinerary.lead ?? null,
    days,
    totalCostCents,
    totalPriceCents,
    marginCents: totalPriceCents - totalCostCents,
    marginPct: totalPriceCents > 0 ? Math.round(((totalPriceCents - totalCostCents) / totalPriceCents) * 100) : 0,
    createdAt: itinerary.createdAt.toISOString(),
    updatedAt: itinerary.updatedAt.toISOString(),
  };
}
