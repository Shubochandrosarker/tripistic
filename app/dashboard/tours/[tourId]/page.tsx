import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { dateKey } from "@/lib/tours/schedule";
import { TOUR_KIND_LABELS, type TourKindValue } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TourForm } from "@/components/tours/tour-form";
import { AddonsPanel } from "@/components/tours/addons-panel";
import { SchedulesPanel } from "@/components/tours/schedules-panel";
import { AvailabilityPanel } from "@/components/tours/availability-panel";
import { BlackoutsPanel } from "@/components/tours/blackouts-panel";
import { SharePanel } from "@/components/tours/share-panel";

export const metadata: Metadata = {
  title: "Tour details",
};

export default async function TourDetailPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const tour = await prisma.tour.findFirst({
    where: { id: tourId, workspaceId: active.workspace.id, deletedAt: null },
  });
  if (!tour) notFound();

  const manage = canManageTours(active.role);
  const [addons, schedules, availabilities, blackouts] = await Promise.all([
    prisma.tourAddon.findMany({
      where: { tourId: tour.id, workspaceId: active.workspace.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tourSchedule.findMany({
      where: { tourId: tour.id, workspaceId: active.workspace.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.availability.findMany({
      where: {
        tourId: tour.id,
        workspaceId: active.workspace.id,
        startsAt: { gte: new Date() },
      },
      orderBy: { startsAt: "asc" },
      take: 100,
    }),
    prisma.blackoutDate.findMany({
      where: {
        workspaceId: active.workspace.id,
        OR: [{ tourId: null }, { tourId: tour.id }],
      },
      orderBy: { startsOn: "asc" },
      include: { tour: { select: { title: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={tour.title}
        description={`${TOUR_KIND_LABELS[tour.kind as TourKindValue] ?? tour.kind} · /${tour.slug} · times shown in ${active.workspace.timezone}`}
        badge={
          <span className="flex items-center gap-1.5">
            <StatusBadge status={tour.status} />
            {tour.visibility === "private" ? (
              <StatusBadge status="inactive" label="private" />
            ) : null}
          </span>
        }
      />

      <SectionCard
        title="Tour details"
        description={manage ? "Guests see these on your public booking page." : "Read-only — ask an owner or admin to make changes."}
      >
        <TourForm
          workspaceId={active.workspace.id}
          defaultCurrency={active.workspace.currency}
          tour={{
            id: tour.id,
            title: tour.title,
            kind: tour.kind,
            status: tour.status,
            visibility: tour.visibility,
            description: tour.description,
            durationMinutes: tour.durationMinutes,
            durationDays: tour.durationDays,
            location: tour.location,
            meetingPoint: tour.meetingPoint,
            capacity: tour.capacity,
            basePrice: tour.basePrice,
            currency: tour.currency,
            cancellationPolicy: tour.cancellationPolicy,
            cancellationNoticeHours: tour.cancellationNoticeHours,
            waiverRequired: tour.waiverRequired,
            coverImageUrl: tour.coverImageUrl,
          }}
        />
      </SectionCard>

      <SectionCard
        title="Share your booking page"
        description={
          tour.status === "active" && tour.visibility === "public"
            ? "Guests can book directly at this link — 0% commission on direct bookings."
            : "Publish the tour (active + public) to make this link live."
        }
      >
        {tour.status === "active" && tour.visibility === "public" ? (
          <SharePanel workspaceSlug={active.workspace.slug} tourSlug={tour.slug} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Set status to <span className="font-medium text-foreground">Active</span> and visibility to{" "}
            <span className="font-medium text-foreground">Public</span> above, then this section shows your
            shareable booking link and embed code.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Recurring schedules"
        description="Rules that generate your departure slots. Edits apply to future generation only."
      >
        <SchedulesPanel
          workspaceId={active.workspace.id}
          tourId={tour.id}
          timezone={active.workspace.timezone}
          canManage={manage}
          schedules={schedules.map((schedule) => ({
            id: schedule.id,
            name: schedule.name,
            daysOfWeek: schedule.daysOfWeek,
            startTime: schedule.startTime,
            durationMinutes: schedule.durationMinutes,
            capacity: schedule.capacity,
            startsOn: dateKey(schedule.startsOn),
            endsOn: schedule.endsOn ? dateKey(schedule.endsOn) : null,
            status: schedule.status,
          }))}
        />
      </SectionCard>

      <SectionCard
        title="Upcoming departures"
        description="Concrete bookable slots. Confirmed bookings decrement remaining seats here in real time."
      >
        <AvailabilityPanel
          workspaceId={active.workspace.id}
          tourId={tour.id}
          timezone={active.workspace.timezone}
          currency={tour.currency}
          basePrice={tour.basePrice}
          canManage={manage}
          availabilities={availabilities.map((slot) => ({
            id: slot.id,
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
            capacity: slot.capacity,
            bookedCount: slot.bookedCount,
            priceOverride: slot.priceOverride,
            status: slot.status,
            scheduleId: slot.scheduleId,
          }))}
        />
      </SectionCard>

      <SectionCard
        title="Add-ons"
        description="Optional extras guests can add to a booking."
      >
        <AddonsPanel
          workspaceId={active.workspace.id}
          tourId={tour.id}
          currency={tour.currency}
          canManage={manage}
          addons={addons.map((addon) => ({
            id: addon.id,
            name: addon.name,
            description: addon.description,
            price: addon.price,
            maxPerBooking: addon.maxPerBooking,
            isActive: addon.isActive,
          }))}
        />
      </SectionCard>

      <SectionCard
        title="Blackout dates"
        description="Slot generation skips these ranges."
      >
        <BlackoutsPanel
          workspaceId={active.workspace.id}
          tourId={tour.id}
          canManage={manage}
          blackouts={blackouts.map((blackout) => ({
            id: blackout.id,
            tourId: blackout.tourId,
            tourTitle: blackout.tour?.title ?? null,
            startsOn: dateKey(blackout.startsOn),
            endsOn: dateKey(blackout.endsOn),
            reason: blackout.reason,
          }))}
        />
      </SectionCard>
    </>
  );
}
