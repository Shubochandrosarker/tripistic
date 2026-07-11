import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/session";
import { getActiveWorkspace } from "@/lib/tenancy/workspace";
import { canManageCustomers, canViewCustomers } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { serializeCustomerDetail } from "@/lib/customers/serializers";
import { BOOKING_STATUS_LABELS, CONSENT_STATUS_LABELS, MESSAGE_STATUS_LABELS, MESSAGE_TEMPLATE_LABELS } from "@/lib/constants";
import { formatDateTimeInTz, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerEditPanel } from "@/components/customers/customer-edit-panel";

type Params = { params: Promise<{ customerId: string }> };

export const metadata: Metadata = {
  title: "Customer",
};

export default async function CustomerDetailPage({ params }: Params) {
  const { customerId } = await params;
  const user = await requireUserPage();
  const active = await getActiveWorkspace(user.id);
  if (!active) redirect("/workspaces/new");
  if (!canViewCustomers(active.role)) notFound();

  const record = await prisma.customer.findFirst({
    where: { id: customerId, workspaceId: active.workspace.id, deletedAt: null },
    include: {
      bookings: {
        orderBy: { departureStartsAt: "desc" },
        take: 25,
        select: {
          id: true,
          reference: true,
          status: true,
          tourTitleSnapshot: true,
          departureStartsAt: true,
          totalAmount: true,
          currency: true,
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });
  if (!record) notFound();

  const customer = serializeCustomerDetail(record, active.role);
  const manage = canManageCustomers(active.role);

  return (
    <>
      <PageHeader
        title={customer.name}
        description={customer.email ?? "Contact details hidden for your role"}
        badge={<StatusBadge status={customer.consentStatus} label={CONSENT_STATUS_LABELS[customer.consentStatus as keyof typeof CONSENT_STATUS_LABELS]} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Booking history">
            {customer.bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {customer.bookings.map((booking) => (
                  <li key={booking.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <Link
                        href={`/dashboard/bookings/${booking.id}`}
                        className="font-mono text-xs font-medium text-foreground hover:text-accent"
                      >
                        {booking.reference}
                      </Link>
                      <p className="text-foreground">{booking.tourTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeInTz(booking.departureStartsAt, active.workspace.timezone)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{formatMoney(booking.totalAmount, booking.currency)}</span>
                      <StatusBadge status={booking.status} label={BOOKING_STATUS_LABELS[booking.status as keyof typeof BOOKING_STATUS_LABELS]} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {manage ? (
            <SectionCard title="Message log" description="Every confirmation, reminder, and review request attempted for this customer.">
              {customer.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages sent yet.</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {customer.messages.map((message, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-foreground">
                        {MESSAGE_TEMPLATE_LABELS[message.templateKey as keyof typeof MESSAGE_TEMPLATE_LABELS] ?? message.templateKey}
                      </span>
                      <div className="flex items-center gap-3">
                        <time className="text-xs text-muted-foreground">
                          {formatDateTimeInTz(message.sentAt ?? message.createdAt, active.workspace.timezone)}
                        </time>
                        <StatusBadge status={message.status} label={MESSAGE_STATUS_LABELS[message.status as keyof typeof MESSAGE_STATUS_LABELS]} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}
        </div>

        <div className="space-y-4">
          <SectionCard title="Profile">
            {manage ? (
              <CustomerEditPanel
                workspaceId={active.workspace.id}
                customerId={customer.id}
                name={customer.name}
                phone={customer.phone}
                country={customer.country}
                tags={customer.tags}
                consentStatus={customer.consentStatus}
                notes={customer.notes}
              />
            ) : (
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <dt>Phone</dt>
                  <dd>{customer.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>Country</dt>
                  <dd>{customer.country ?? "—"}</dd>
                </div>
              </dl>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
