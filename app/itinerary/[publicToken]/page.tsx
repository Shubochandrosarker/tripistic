import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findItineraryByPublicToken } from "@/lib/itinerary/service";
import { serializeItinerary } from "@/lib/itinerary/serializers";
import { formatDate, formatMoney } from "@/lib/utils";
import { ITINERARY_ITEM_TYPE_LABELS, type ItineraryItemTypeValue } from "@/lib/constants";
import { PrintButton } from "@/components/itineraries/print-button";

type Params = { params: Promise<{ publicToken: string }> };

export const metadata: Metadata = {
  title: "Your itinerary",
  robots: { index: false, follow: false },
};

export default async function PublicItineraryPage({ params }: Params) {
  const { publicToken } = await params;
  const record = await findItineraryByPublicToken(publicToken);
  if (!record) notFound();

  const itinerary = serializeItinerary(record);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{record.workspace.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{itinerary.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {itinerary.destination ? `${itinerary.destination} · ` : ""}
            {itinerary.dayCount} day{itinerary.dayCount === 1 ? "" : "s"}
            {itinerary.startDate ? ` · Starting ${formatDate(itinerary.startDate)}` : ""}
            {itinerary.travelerCount ? ` · ${itinerary.travelerCount} traveler${itinerary.travelerCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <PrintButton />
      </div>

      <div className="space-y-4">
        {itinerary.days.map((day) => (
          <section key={day.id} className="rounded-xl border border-border bg-card p-5 shadow-xs">
            <h2 className="text-base font-semibold text-foreground">
              Day {day.dayNumber}
              {day.title ? ` — ${day.title}` : ""}
            </h2>
            {day.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Free day.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {day.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        {item.startTime ? <span className="font-mono text-xs text-muted-foreground">{item.startTime}</span> : null}
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {ITINERARY_ITEM_TYPE_LABELS[item.type as ItineraryItemTypeValue] ?? item.type}
                        </span>
                      </div>
                      <p className="mt-0.5 font-medium text-foreground">{item.title}</p>
                      {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                    </div>
                    <span className="shrink-0 text-muted-foreground">{formatMoney(item.priceCents, itinerary.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between text-base font-semibold text-foreground">
          <span>Total</span>
          <span>{formatMoney(itinerary.totalPriceCents, itinerary.currency)}</span>
        </div>
      </div>
    </div>
  );
}
