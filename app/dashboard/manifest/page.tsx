import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Circle } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { getManifestForMember } from "@/lib/guides/manifest";
import { formatDateTimeInTz } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "My Manifest",
};

/**
 * "Guide sees only assigned departures" (docs/02 §6 AC) — every role can
 * open this page; it is simply empty for anyone with no assignments. See
 * docs/21 §6 for why this is not a role gate.
 */
export default async function ManifestPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const departures = await getManifestForMember(active.workspace.id, active.membership.id);

  return (
    <>
      <PageHeader
        title="My Manifest"
        description="Your upcoming assigned departures — participants, contact notes, and waiver status for each."
      />

      {departures.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No assigned departures"
          description="When an owner, admin, or staff member assigns you to lead a departure, it shows up here."
        />
      ) : (
        <div className="space-y-4">
          {departures.map((departure) => (
            <div key={departure.id} className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{departure.tourTitle}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTimeInTz(departure.startsAt, active.workspace.timezone)}
                  </p>
                </div>
                {departure.meetingPoint ? (
                  <p className="text-xs text-muted-foreground">Meet: {departure.meetingPoint}</p>
                ) : null}
              </div>

              {departure.bookings.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No confirmed bookings yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {departure.bookings.map((booking) => (
                    <li key={booking.id} className="py-2.5">
                      <p className="text-sm font-medium text-foreground">
                        {booking.guestFirstName} {booking.guestLastName}
                        {booking.guestPhone ? (
                          <span className="ml-2 font-normal text-muted-foreground">{booking.guestPhone}</span>
                        ) : null}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {booking.participants.map((participant) => (
                          <li key={participant.id} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            {participant.waiverSigned === null ? null : participant.waiverSigned ? (
                              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Waiver signed" />
                            ) : (
                              <Circle className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-label="Waiver not yet signed" />
                            )}
                            <span>
                              {participant.firstName} {participant.lastName}
                              {participant.notes ? <span className="block italic">{participant.notes}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
