import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Map, Plus } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageTours } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { TOUR_KIND_LABELS, type TourKindValue } from "@/lib/constants";
import { formatDuration, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Tours",
};

export default async function ToursPage() {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");

  const manage = canManageTours(active.role);
  const tours = await prisma.tour.findMany({
    where: { workspaceId: active.workspace.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      _count: {
        select: {
          availabilities: { where: { status: "scheduled", startsAt: { gt: new Date() } } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Tours"
        description="Your products: tours, activities, and multi-day packages with schedules and capacity."
        actions={
          manage ? (
            <ButtonLink href="/dashboard/tours/new" size="sm">
              <Plus className="size-4" aria-hidden /> New tour
            </ButtonLink>
          ) : null
        }
      />

      {tours.length === 0 ? (
        <EmptyState
          icon={Map}
          title="Create your first tour"
          description="Define what guests can book — title, duration, capacity, and price — then add a recurring schedule to open your calendar. Bookings start flowing when the booking engine ships in Phase 3."
          actions={
            manage ? (
              <ButtonLink href="/dashboard/tours/new">
                <Plus className="size-4" aria-hidden /> New tour
              </ButtonLink>
            ) : undefined
          }
          footnote={
            manage
              ? undefined
              : "Ask a workspace owner or admin to create the first tour."
          }
        />
      ) : (
        <TableShell
          headers={["Tour", "Type", "Duration", "Capacity", "Price", "Upcoming", "Status"]}
        >
          {tours.map((tour) => (
            <tr key={tour.id} className="transition-colors hover:bg-muted/50">
              <Td>
                <Link
                  href={`/dashboard/tours/${tour.id}`}
                  className="font-medium text-foreground hover:text-accent"
                >
                  {tour.title}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {tour.location ?? "No location set"}
                  {tour.visibility === "private" ? " · private" : ""}
                </span>
              </Td>
              <Td className="text-muted-foreground">
                {TOUR_KIND_LABELS[tour.kind as TourKindValue] ?? tour.kind}
              </Td>
              <Td className="text-muted-foreground">
                {tour.kind === "package" && tour.durationDays
                  ? `${tour.durationDays} days`
                  : formatDuration(tour.durationMinutes)}
              </Td>
              <Td className="text-muted-foreground">{tour.capacity}</Td>
              <Td className="text-muted-foreground">
                {formatMoney(tour.basePrice, tour.currency)}
              </Td>
              <Td className="text-muted-foreground">
                {tour._count.availabilities} departure{tour._count.availabilities === 1 ? "" : "s"}
              </Td>
              <Td>
                <StatusBadge status={tour.status} />
              </Td>
            </tr>
          ))}
        </TableShell>
      )}
    </>
  );
}
