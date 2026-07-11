import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTourBookingPageData } from "@/lib/bookings/page-data";
import { formatDuration, formatMoney } from "@/lib/utils";
import { TourBookingForm } from "@/components/booking/tour-booking-form";

type Params = { params: Promise<{ workspaceSlug: string; tourSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug, tourSlug } = await params;
  const found = await getTourBookingPageData(workspaceSlug, tourSlug);
  return { title: found ? found.tour.title : "Not found", robots: { index: false, follow: false } };
}

/** Iframe-ready booking widget — same data loader, same form, same canonical booking service as the full page. */
export default async function EmbedTourBookingPage({ params }: Params) {
  const { workspaceSlug, tourSlug } = await params;
  const found = await getTourBookingPageData(workspaceSlug, tourSlug);
  if (!found) notFound();
  const { workspace, tour, addons, availabilities } = found;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-foreground">{tour.title}</h1>
        <p className="text-xs text-muted-foreground">
          {formatDuration(tour.durationMinutes)}
          {tour.location ? ` · ${tour.location}` : ""} · from {formatMoney(tour.basePrice, tour.currency)}
        </p>
      </div>

      <TourBookingForm
        workspaceSlug={workspace.slug}
        tourSlug={tour.slug}
        timezone={workspace.timezone}
        currency={tour.currency}
        basePrice={tour.basePrice}
        maxCapacity={tour.capacity}
        addons={addons.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          price: a.price,
          maxPerBooking: a.maxPerBooking,
        }))}
        availabilities={availabilities.map((a) => ({
          id: a.id,
          startsAt: a.startsAt.toISOString(),
          endsAt: a.endsAt.toISOString(),
          remainingCapacity: Math.max(a.capacity - a.bookedCount, 0),
          unitPrice: a.priceOverride ?? tour.basePrice,
        }))}
      />

      <p className="text-center text-[11px] text-muted-foreground">Powered by Tripistic</p>
    </div>
  );
}
