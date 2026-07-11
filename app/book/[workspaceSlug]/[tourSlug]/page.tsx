import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass, MapPin } from "lucide-react";
import { getTourBookingPageData } from "@/lib/bookings/page-data";
import { formatDuration } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { TourBookingForm } from "@/components/booking/tour-booking-form";

type Params = { params: Promise<{ workspaceSlug: string; tourSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspaceSlug, tourSlug } = await params;
  const found = await getTourBookingPageData(workspaceSlug, tourSlug);
  return { title: found ? `${found.tour.title} — ${found.workspace.name}` : "Not found" };
}

export default async function TourBookingPage({ params }: Params) {
  const { workspaceSlug, tourSlug } = await params;
  const found = await getTourBookingPageData(workspaceSlug, tourSlug);
  if (!found) notFound();
  const { workspace, tour, addons, availabilities } = found;

  return (
    <>
      <PageHeader
        title={tour.title}
        description={`${formatDuration(tour.durationMinutes)}${tour.location ? ` · ${tour.location}` : ""} · times shown in ${workspace.timezone}`}
      />

      {tour.coverImageUrl ? (
        <div className="overflow-hidden rounded-xl border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element -- external, workspace-supplied URL */}
          <img src={tour.coverImageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-border bg-muted">
          <Compass className="size-10 text-muted-foreground" aria-hidden />
        </div>
      )}

      {tour.description ? (
        <SectionCard title="About this experience">
          <p className="whitespace-pre-line text-sm text-muted-foreground">{tour.description}</p>
        </SectionCard>
      ) : null}

      {tour.meetingPoint || tour.cancellationPolicy ? (
        <SectionCard title="Good to know">
          <dl className="space-y-3 text-sm">
            {tour.meetingPoint ? (
              <div>
                <dt className="flex items-center gap-1.5 font-medium text-foreground">
                  <MapPin className="size-3.5" aria-hidden /> Meeting point
                </dt>
                <dd className="mt-0.5 text-muted-foreground">{tour.meetingPoint}</dd>
              </div>
            ) : null}
            {tour.cancellationPolicy ? (
              <div>
                <dt className="font-medium text-foreground">Cancellation policy</dt>
                <dd className="mt-0.5 text-muted-foreground">{tour.cancellationPolicy}</dd>
              </div>
            ) : null}
            {tour.waiverRequired ? (
              <div>
                <dt className="font-medium text-foreground">Waiver</dt>
                <dd className="mt-0.5 text-muted-foreground">
                  This experience requires a signed waiver. You&apos;ll be contacted with details after booking.
                </dd>
              </div>
            ) : null}
          </dl>
        </SectionCard>
      ) : null}

      <SectionCard title="Book this experience" description="Select a date, add your group, and reserve instantly.">
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
      </SectionCard>

      <p className="text-center text-xs text-muted-foreground">
        Online payment isn&apos;t available yet — your seat is reserved now and payment is arranged directly with the
        operator. You won&apos;t receive an automated confirmation email yet either; save your confirmation link.
      </p>
    </>
  );
}
