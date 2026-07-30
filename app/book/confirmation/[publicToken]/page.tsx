import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDepartureInTz, formatMoney } from "@/lib/utils";
import { serializePublicBookingConfirmation } from "@/lib/bookings/serializers";
import { getLatestPaymentForBooking } from "@/lib/payments/service";
import { serializePublicPayment } from "@/lib/payments/serializers";
import { PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PaymentRetryButton } from "@/components/booking/payment-retry-button";
import { WaiverSection } from "@/components/waivers/waiver-section";

type Params = { params: Promise<{ publicToken: string }> };

export const metadata: Metadata = {
  title: "Booking confirmed",
  robots: { index: false, follow: false },
};

export default async function BookingConfirmationPage({ params }: Params) {
  const { publicToken } = await params;
  const record = await prisma.booking.findUnique({
    where: { publicToken },
    include: {
      participants: true,
      addonSelections: true,
      // Needed to render the departure in the operator's timezone rather
      // than the server's — see below.
      workspace: { select: { timezone: true } },
    },
  });
  if (!record) notFound();
  const booking = serializePublicBookingConfirmation(record);
  const payment = serializePublicPayment(await getLatestPaymentForBooking(record.workspaceId, record.id));

  // Rendered in the workspace's timezone. Without an explicit `timeZone` this
  // used the *server's* zone, so a guest could be told a different departure
  // time than the operator sees on the manifest — and the time would change if
  // the app were deployed to a different region. Emails already did this
  // correctly via formatDateTimeInTz; this page did not.
  const departureLocal = formatDepartureInTz(booking.departureStartsAt, record.workspace.timezone);

  const awaitingPayment = booking.status === "pending" && payment != null;
  const paymentDidNotSucceed = payment != null && (payment.status === "failed" || payment.status === "cancelled");
  const heading = awaitingPayment
    ? "Awaiting payment"
    : booking.status === "confirmed"
      ? "Booking confirmed"
      : booking.status === "cancelled"
        ? "Booking cancelled"
        : "Booking received";
  const Icon = awaitingPayment ? Clock : booking.status === "cancelled" ? XCircle : CheckCircle2;

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Icon className="size-6" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold text-foreground">{heading}</h1>
        <p className="text-sm text-muted-foreground">
          Reference{" "}
          <span data-testid="booking-reference" className="font-mono font-medium text-foreground">
            {booking.reference}
          </span>
        </p>
        <StatusBadge status={booking.status} />
      </div>

      {payment ? (
        <SectionCard title="Payment">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <StatusBadge status={payment.status} label={PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS]} />
              <span className="text-sm font-semibold text-foreground">{formatMoney(payment.amount, payment.currency)}</span>
            </div>
            {payment.status === "requires_payment" || payment.status === "processing" ? (
              payment.checkoutUrl ? (
                <a
                  href={payment.checkoutUrl}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Complete payment
                </a>
              ) : (
                <PaymentRetryButton publicToken={booking.publicToken} />
              )
            ) : null}
            {paymentDidNotSucceed ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {booking.status === "pending"
                    ? "Your payment didn't go through. Your seats are still held — try again below."
                    : "This booking was cancelled because payment wasn't completed in time. Its seats have been released."}
                </p>
                {booking.status === "pending" ? <PaymentRetryButton publicToken={booking.publicToken} /> : null}
              </div>
            ) : null}
            {payment.status === "succeeded" && payment.receiptUrl ? (
              <a href={payment.receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
                View payment receipt
              </a>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={booking.tourTitle}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-foreground">Departure</dt>
            <dd className="text-muted-foreground">{departureLocal}</dd>
          </div>
          {booking.location ? (
            <div>
              <dt className="font-medium text-foreground">Location</dt>
              <dd className="text-muted-foreground">{booking.location}</dd>
            </div>
          ) : null}
          {booking.meetingPoint ? (
            <div className="sm:col-span-2">
              <dt className="font-medium text-foreground">Meeting point</dt>
              <dd className="text-muted-foreground">{booking.meetingPoint}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-foreground">Lead guest</dt>
            <dd className="text-muted-foreground">
              {booking.guestFirstName} {booking.guestLastName}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Party size</dt>
            <dd className="text-muted-foreground">{booking.participantCount}</dd>
          </div>
        </dl>
      </SectionCard>

      {booking.participants.length > 0 ? (
        <SectionCard title="Guests">
          <ul className="space-y-1 text-sm text-muted-foreground">
            {booking.participants.map((p, i) => (
              <li key={i}>
                {p.firstName} {p.lastName}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Price summary">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <dt>
              {formatMoney(booking.unitPrice, booking.currency)} × {booking.participantCount}
            </dt>
            <dd>{formatMoney(booking.subtotal, booking.currency)}</dd>
          </div>
          {booking.addons.map((addon, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <dt>
                {addon.name} × {addon.quantity}
              </dt>
              <dd>{formatMoney(addon.totalPrice, booking.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-foreground">
            <dt>Total booked value</dt>
            <dd>{formatMoney(booking.totalAmount, booking.currency)}</dd>
          </div>
        </dl>
      </SectionCard>

      {booking.cancellationPolicy ? (
        <SectionCard title="Cancellation policy">
          <p className="text-sm text-muted-foreground">{booking.cancellationPolicy}</p>
        </SectionCard>
      ) : null}

      {booking.status !== "cancelled" ? <WaiverSection publicToken={booking.publicToken} /> : null}

      <p className="rounded-lg border border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground print:hidden">
        A confirmation email has also been sent — this page is your confirmation and receipt either way.
        Save or bookmark this link.
      </p>
    </div>
  );
}
