import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageBookings, canViewBookings } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { serializeBookingDetail } from "@/lib/bookings/serializers";
import { serializePaymentDetail, serializePaymentSummary } from "@/lib/payments/serializers";
import { BOOKING_SOURCE_LABELS, BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { formatDateTimeInTz, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { BookingStatusActions } from "@/components/bookings/booking-status-actions";
import { PaymentLinkAction } from "@/components/bookings/payment-link-action";

type Params = { params: Promise<{ bookingId: string }> };

export const metadata: Metadata = {
  title: "Booking detail",
};

export default async function BookingDetailPage({ params }: Params) {
  const { bookingId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewBookings(active.role)) notFound();

  const record = await prisma.booking.findFirst({
    where: { id: bookingId, workspaceId: active.workspace.id },
    include: {
      participants: true,
      addonSelections: true,
      statusEvents: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { events: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!record) notFound();

  const booking = serializeBookingDetail(record, active.role);
  const manage = canManageBookings(active.role);
  const paymentRecord = record.payments[0] ?? null;
  const payment = serializePaymentSummary(paymentRecord);
  const paymentDetail = serializePaymentDetail(paymentRecord, active.role);
  const canGeneratePaymentLink = manage && booking.status === "pending" && booking.totalAmount > 0;

  return (
    <>
      <PageHeader
        title={`Booking ${booking.reference}`}
        description={`${booking.tourTitle} · ${formatDateTimeInTz(booking.departureStartsAt, active.workspace.timezone)}`}
        badge={<StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status as keyof typeof BOOKING_STATUS_LABELS]} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Guest">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Name</dt>
                <dd className="text-muted-foreground">{booking.guestName}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Email</dt>
                <dd className="text-muted-foreground">{booking.guestEmail ?? "Hidden for your role"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Phone</dt>
                <dd className="text-muted-foreground">{booking.guestPhone ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Party size</dt>
                <dd className="text-muted-foreground">{booking.participantCount}</dd>
              </div>
              {booking.guestNotes ? (
                <div className="sm:col-span-2">
                  <dt className="font-medium text-foreground">Guest notes</dt>
                  <dd className="text-muted-foreground">{booking.guestNotes}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard title="Participants">
            <ul className="divide-y divide-border text-sm">
              {booking.participants.map((p, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-1 py-2">
                  <span className="text-foreground">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.email ?? p.phone ?? p.notes ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>

          {booking.addonSelections.length > 0 ? (
            <SectionCard title="Add-ons">
              <ul className="divide-y divide-border text-sm">
                {booking.addonSelections.map((a, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span className="text-foreground">
                      {a.name} × {a.quantity}
                    </span>
                    <span className="text-muted-foreground">{formatMoney(a.totalPrice, booking.currency)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}

          <SectionCard title="Departure & tour snapshot" description="Recorded at booking time — later tour edits don't change this.">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Tour</dt>
                <dd className="text-muted-foreground">{booking.tourTitle}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Departure</dt>
                <dd className="text-muted-foreground">
                  {formatDateTimeInTz(booking.departureStartsAt, active.workspace.timezone)} –{" "}
                  {formatDateTimeInTz(booking.departureEndsAt, active.workspace.timezone)}
                </dd>
              </div>
              {booking.location ? (
                <div>
                  <dt className="font-medium text-foreground">Location</dt>
                  <dd className="text-muted-foreground">{booking.location}</dd>
                </div>
              ) : null}
              {booking.meetingPoint ? (
                <div>
                  <dt className="font-medium text-foreground">Meeting point</dt>
                  <dd className="text-muted-foreground">{booking.meetingPoint}</dd>
                </div>
              ) : null}
            </dl>
          </SectionCard>

          <SectionCard title="Status history">
            <ol className="space-y-2 text-sm">
              {booking.statusEvents.map((event, i) => (
                <li key={i} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="text-foreground">
                      {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : `Created as ${event.toStatus}`}
                    </span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {event.actorName ? `by ${event.actorName}` : "guest"}
                    </span>
                    {event.note ? <p className="text-xs text-muted-foreground">{event.note}</p> : null}
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTimeInTz(event.createdAt, active.workspace.timezone)}
                  </time>
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>

        <div className="space-y-4">
          {manage ? (
            <SectionCard title="Status">
              <BookingStatusActions workspaceId={active.workspace.id} bookingId={booking.id} currentStatus={booking.status} />
            </SectionCard>
          ) : null}

          <SectionCard title="Payment">
            {payment ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <StatusBadge
                    status={payment.status}
                    label={PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS]}
                  />
                  <span className="text-sm font-semibold text-foreground">{formatMoney(payment.amount, payment.currency)}</span>
                </div>
                {payment.refundedAmount ? (
                  <p className="text-xs text-muted-foreground">
                    Refunded: {formatMoney(payment.refundedAmount, payment.currency)}
                  </p>
                ) : null}
                {paymentDetail ? (
                  <dl className="space-y-1.5 text-xs text-muted-foreground">
                    {paymentDetail.providerPaymentIntentId ? (
                      <div className="flex justify-between gap-2">
                        <dt>Payment intent</dt>
                        <dd className="truncate font-mono">{paymentDetail.providerPaymentIntentId}</dd>
                      </div>
                    ) : null}
                    {paymentDetail.failureMessage ? (
                      <div className="flex justify-between gap-2">
                        <dt>Failure reason</dt>
                        <dd className="text-right">{paymentDetail.failureMessage}</dd>
                      </div>
                    ) : null}
                    {paymentDetail.receiptUrl ? (
                      <div>
                        <a href={paymentDetail.receiptUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          View Stripe receipt
                        </a>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {paymentDetail && paymentDetail.events.length > 0 ? (
                  <ol className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    {paymentDetail.events.map((event, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span>{event.eventType}</span>
                        <time>{formatDateTimeInTz(event.createdAt, active.workspace.timezone)}</time>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {booking.totalAmount > 0 ? "No payment has been started for this booking yet." : "This booking has nothing to charge."}
              </p>
            )}
            {canGeneratePaymentLink ? (
              <div className="mt-3 border-t border-border pt-3">
                <PaymentLinkAction workspaceId={active.workspace.id} bookingId={booking.id} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Pricing">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Unit price</dt>
                <dd>{formatMoney(booking.unitPrice, booking.currency)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Subtotal</dt>
                <dd>{formatMoney(booking.subtotal, booking.currency)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Add-ons</dt>
                <dd>{formatMoney(booking.addonsTotal, booking.currency)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-foreground">
                <dt>Total booked value</dt>
                <dd>{formatMoney(booking.totalAmount, booking.currency)}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Details">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Source</dt>
                <dd>{BOOKING_SOURCE_LABELS[booking.source as keyof typeof BOOKING_SOURCE_LABELS]}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Created</dt>
                <dd>{formatDateTimeInTz(booking.createdAt, active.workspace.timezone)}</dd>
              </div>
            </dl>
            {booking.publicToken ? (
              <Link
                href={`/book/confirmation/${booking.publicToken}`}
                target="_blank"
                className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
              >
                View public confirmation <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </SectionCard>

          {booking.operatorNotes ? (
            <SectionCard title="Operator notes" description="Internal only.">
              <p className="text-sm text-muted-foreground">{booking.operatorNotes}</p>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
