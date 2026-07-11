import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarCheck, Plus } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageBookings, canViewBookings } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { bookingListQuerySchema } from "@/lib/validation";
import { buildBookingListQuery } from "@/lib/bookings/query";
import { serializeBookingListItem } from "@/lib/bookings/serializers";
import { BOOKING_SOURCE_LABELS, BOOKING_STATUSES, BOOKING_STATUS_LABELS } from "@/lib/constants";
import { formatDateTimeInTz, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableShell, Td } from "@/components/ui/table-shell";
import { ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export const metadata: Metadata = {
  title: "Bookings",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewBookings(active.role)) notFound();

  const raw = await searchParams;
  const parsedQuery = bookingListQuerySchema.safeParse({
    status: firstValue(raw.status) || undefined,
    source: firstValue(raw.source) || undefined,
    tourId: firstValue(raw.tourId) || undefined,
    when: firstValue(raw.when) || undefined,
    search: firstValue(raw.search) || undefined,
    page: firstValue(raw.page) || undefined,
  });
  const query = parsedQuery.success ? parsedQuery.data : bookingListQuerySchema.parse({});

  const { where, orderBy, skip, take } = buildBookingListQuery(active.workspace.id, query);

  const [bookings, total, summary] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy,
      skip,
      take,
      include: { participants: true, addonSelections: true },
    }),
    prisma.booking.count({ where }),
    prisma.booking.groupBy({
      by: ["status"],
      where: { workspaceId: active.workspace.id },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const countByStatus = Object.fromEntries(summary.map((row) => [row.status, row._count._all]));
  const bookedValue = summary.reduce((sum, row) => sum + (row._sum.totalAmount ?? 0), 0);
  const totalBookings = summary.reduce((sum, row) => sum + row._count._all, 0);
  const manage = canManageBookings(active.role);

  function pageHref(page: number) {
    const params = new URLSearchParams();
    if (query.status) params.set("status", query.status);
    if (query.source) params.set("source", query.source);
    if (query.when !== "all") params.set("when", query.when);
    if (query.search) params.set("search", query.search);
    params.set("page", String(page));
    return `/dashboard/bookings?${params.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Every reservation — direct and manual — in one place."
        actions={
          manage ? (
            <ButtonLink href="/dashboard/bookings/new" size="sm">
              <Plus className="size-4" aria-hidden /> New booking
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total bookings" value={String(totalBookings)} />
        <SummaryCard label="Pending" value={String(countByStatus.pending ?? 0)} />
        <SummaryCard label="Confirmed" value={String(countByStatus.confirmed ?? 0)} />
        <SummaryCard
          label="Total booked value"
          value={formatMoney(bookedValue, active.workspace.currency)}
          hint="Booked value, not paid revenue — payments arrive in Phase 4."
        />
      </div>

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-[140px] flex-1 sm:flex-none">
          <label htmlFor="search" className="mb-1 block text-xs font-medium text-muted-foreground">
            Search
          </label>
          <input
            id="search"
            name="search"
            defaultValue={query.search ?? ""}
            placeholder="Reference or guest name"
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1 block text-xs font-medium text-muted-foreground">
            Status
          </label>
          <Select id="status" name="status" defaultValue={query.status ?? ""}>
            <option value="">All statuses</option>
            {BOOKING_STATUSES.map((status) => (
              <option key={status} value={status}>
                {BOOKING_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="source" className="mb-1 block text-xs font-medium text-muted-foreground">
            Source
          </label>
          <Select id="source" name="source" defaultValue={query.source ?? ""}>
            <option value="">All sources</option>
            <option value="public_direct">{BOOKING_SOURCE_LABELS.public_direct}</option>
            <option value="manual">{BOOKING_SOURCE_LABELS.manual}</option>
          </Select>
        </div>
        <div>
          <label htmlFor="when" className="mb-1 block text-xs font-medium text-muted-foreground">
            Departure
          </label>
          <Select id="when" name="when" defaultValue={query.when}>
            <option value="all">All time</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </Select>
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Filter
        </button>
      </form>

      {bookings.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title={total === 0 && !query.search && !query.status ? "No bookings yet" : "No bookings match these filters"}
          description={
            total === 0 && !query.search && !query.status
              ? "Publish a tour and share its booking link, or create a manual booking for a phone or walk-in guest."
              : "Try a different search term or clear the filters."
          }
          actions={
            manage && total === 0 ? (
              <ButtonLink href="/dashboard/bookings/new">
                <Plus className="size-4" aria-hidden /> New booking
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <TableShell
            headers={["Reference", "Guest", "Tour", "Departure", "Party", "Status", "Source", "Value"]}
          >
            {bookings.map((booking) => {
              const item = serializeBookingListItem(booking, active.role);
              return (
                <tr key={item.id} className="transition-colors hover:bg-muted/50">
                  <Td>
                    <Link
                      href={`/dashboard/bookings/${item.id}`}
                      className="font-mono text-xs font-medium text-foreground hover:text-accent"
                    >
                      {item.reference}
                    </Link>
                  </Td>
                  <Td>
                    <span className="text-foreground">{item.guestName}</span>
                    {item.guestEmail ? (
                      <span className="block text-xs text-muted-foreground">{item.guestEmail}</span>
                    ) : null}
                  </Td>
                  <Td className="text-muted-foreground">{item.tourTitle}</Td>
                  <Td className="text-muted-foreground">
                    {formatDateTimeInTz(item.departureStartsAt, active.workspace.timezone)}
                  </Td>
                  <Td className="text-muted-foreground">{item.participantCount}</Td>
                  <Td>
                    <StatusBadge status={item.status} label={BOOKING_STATUS_LABELS[item.status as keyof typeof BOOKING_STATUS_LABELS]} />
                  </Td>
                  <Td className="text-muted-foreground">{BOOKING_SOURCE_LABELS[item.source as keyof typeof BOOKING_SOURCE_LABELS]}</Td>
                  <Td className="text-muted-foreground">{formatMoney(item.totalAmount, item.currency)}</Td>
                </tr>
              );
            })}
          </TableShell>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {query.page} of {totalPages} · {total} booking{total === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                {query.page > 1 ? (
                  <Link href={pageHref(query.page - 1)} className="text-accent hover:underline">
                    Previous
                  </Link>
                ) : null}
                {query.page < totalPages ? (
                  <Link href={pageHref(query.page + 1)} className="text-accent hover:underline">
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
