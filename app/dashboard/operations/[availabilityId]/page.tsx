import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageOperations, canViewOperations } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { requireAvailabilityForOps, listOpsEvents } from "@/lib/operations/service";
import { OPS_EVENT_TYPE_LABELS, OPS_STATUS_LABELS, type OpsEventTypeValue, type OpsStatusValue } from "@/lib/constants";
import { formatDateTimeInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { OpsStatusControl } from "@/components/operations/ops-status-control";
import { CheckInButton } from "@/components/operations/checkin-button";
import { OpsNoteForm } from "@/components/operations/ops-note-form";

type Params = { params: Promise<{ availabilityId: string }> };

export const metadata: Metadata = { title: "Departure" };

export default async function DepartureOpsPage({ params }: Params) {
  const { availabilityId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewOperations(active.role)) notFound();

  const availability = await requireAvailabilityForOps(active.workspace.id, availabilityId).catch(() => null);
  if (!availability) notFound();

  const [bookings, events] = await Promise.all([
    prisma.booking.findMany({
      where: { workspaceId: active.workspace.id, availabilityId, status: "confirmed" },
      orderBy: { guestLastName: "asc" },
      select: { id: true, reference: true, guestFirstName: true, guestLastName: true, participantCount: true, checkedInAt: true },
    }),
    listOpsEvents(active.workspace.id, availabilityId),
  ]);

  const manage = canManageOperations(active.role);

  return (
    <>
      <PageHeader
        title={availability.tour.title}
        description={formatDateTimeInTz(availability.startsAt, active.workspace.timezone)}
        badge={<StatusBadge status={availability.opsStatus} label={OPS_STATUS_LABELS[availability.opsStatus as OpsStatusValue]} />}
        actions={manage ? <OpsStatusControl workspaceId={active.workspace.id} availabilityId={availabilityId} status={availability.opsStatus as OpsStatusValue} /> : null}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Check-ins" description={`${bookings.filter((b) => b.checkedInAt).length} of ${bookings.length} confirmed guests checked in`}>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No confirmed bookings on this departure.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {bookings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-foreground">
                      {b.guestFirstName} {b.guestLastName}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {b.reference} · {b.participantCount} guest{b.participantCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  {b.checkedInAt ? (
                    <StatusBadge status="confirmed" label="Checked in" />
                  ) : manage ? (
                    <CheckInButton workspaceId={active.workspace.id} bookingId={b.id} />
                  ) : (
                    <span className="text-xs text-muted-foreground">Not yet</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Party" description="Guide, driver, and vehicle assigned to this departure.">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <dt>Guide</dt>
              <dd className="text-foreground">{availability.guide?.user.name ?? "Unassigned"}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Driver</dt>
              <dd className="text-foreground">{availability.driver?.user.name ?? "Unassigned"}</dd>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <dt>Vehicle</dt>
              <dd className="text-foreground">{availability.vehicle?.name ?? "Unassigned"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Reassign guide/driver/vehicle from this tour&apos;s availability panel, or use AI matching there to find the best fit.
          </p>
        </SectionCard>
      </div>

      <SectionCard title="Timeline" description="Status changes, notes, check-ins, and incidents for this departure.">
        {manage ? (
          <div className="mb-4">
            <OpsNoteForm workspaceId={active.workspace.id} availabilityId={availabilityId} />
          </div>
        ) : null}
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{OPS_EVENT_TYPE_LABELS[event.type as OpsEventTypeValue]}</p>
                    <time className="text-xs text-muted-foreground">
                      {formatDateTimeInTz(event.createdAt, active.workspace.timezone)}
                    </time>
                  </div>
                  {event.message ? <p className="text-xs text-muted-foreground">{event.message}</p> : null}
                  {event.actor?.name ? <p className="text-xs text-muted-foreground">by {event.actor.name}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
