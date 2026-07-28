import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Compass, MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveActiveCustomDomain } from "@/lib/domains/service";
import { getTourBookingPageData } from "@/lib/bookings/page-data";
import { getPublishedStorefrontBySlug } from "@/lib/storefront/service";
import { formatDuration } from "@/lib/utils";
import { PublicStorefront } from "@/components/storefront/public-storefront";
import { TourBookingForm } from "@/components/booking/tour-booking-form";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

type Params = { params: Promise<{ hostname: string; path?: string[] }> };

async function resolveDomain(hostname: string) {
  const domain = await resolveActiveCustomDomain(decodeURIComponent(hostname));
  if (!domain) notFound();
  return domain;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { hostname, path = [] } = await params;
  const domain = await resolveDomain(hostname);
  const storefront = await getPublishedStorefrontBySlug(domain.workspace.slug);
  if (!storefront) return { title: domain.workspace.name };
  if (path[0] === "tours" && path[1]) {
    const tour = await prisma.tour.findFirst({
      where: {
        workspaceId: domain.workspaceId,
        slug: path[1],
        status: "active",
        visibility: "public",
        deletedAt: null,
      },
    });
    return { title: tour ? `${tour.title} - ${domain.workspace.name}` : domain.workspace.name };
  }
  return {
    title: storefront.published.seo.title,
    description: storefront.published.seo.description,
  };
}

export default async function HostedStorefrontPage({ params }: Params) {
  const { hostname, path = [] } = await params;
  const domain = await resolveDomain(hostname);

  if (path.length === 0) {
    const storefront = await getPublishedStorefrontBySlug(domain.workspace.slug);
    if (!storefront) notFound();
    const tours = await prisma.tour.findMany({
      where: { workspaceId: domain.workspaceId, status: "active", visibility: "public", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return (
      <PublicStorefront
        workspace={storefront.workspace}
        storefront={storefront.published}
        tours={tours}
        tourHref={(tourSlug) => `/tours/${tourSlug}`}
      />
    );
  }

  if (path[0] === "tours" && path[1] && path.length === 2) {
    const found = await getTourBookingPageData(domain.workspace.slug, path[1]);
    if (!found) notFound();
    const { workspace, tour, addons, availabilities } = found;

    return (
      <>
        <PageHeader
          title={tour.title}
          description={`${formatDuration(tour.durationMinutes)}${tour.location ? ` - ${tour.location}` : ""} - times shown in ${workspace.timezone}`}
        />

        {tour.coverImageUrl ? (
          <div className="overflow-hidden rounded-xl border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- workspace-supplied image URL */}
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
      </>
    );
  }

  notFound();
}
