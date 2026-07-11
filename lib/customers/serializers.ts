import type { Customer, WorkspaceRole } from "@prisma/client";
import { canViewBookingPII } from "@/lib/auth/permissions";

export type CustomerListItem = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  consentStatus: string;
  bookingCount: number;
  createdAt: string;
};

export function serializeCustomerListItem(
  customer: Customer & { _count?: { bookings: number } },
  role: WorkspaceRole,
): CustomerListItem {
  const showPII = canViewBookingPII(role);
  return {
    id: customer.id,
    name: customer.name,
    email: showPII ? customer.email : null,
    phone: showPII ? customer.phone : null,
    tags: customer.tags,
    consentStatus: customer.consentStatus,
    bookingCount: customer._count?.bookings ?? 0,
    createdAt: customer.createdAt.toISOString(),
  };
}

export type CustomerBookingSummary = {
  id: string;
  reference: string;
  status: string;
  tourTitle: string;
  departureStartsAt: string;
  totalAmount: number;
  currency: string;
};

export type CustomerMessageSummary = {
  templateKey: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
};

export type CustomerDetail = CustomerListItem & {
  country: string | null;
  notes: string | null;
  updatedAt: string;
  bookings: CustomerBookingSummary[];
  messages: CustomerMessageSummary[];
};

type CustomerDetailSource = Customer & {
  bookings?: {
    id: string;
    reference: string;
    status: string;
    tourTitleSnapshot: string;
    departureStartsAt: Date;
    totalAmount: number;
    currency: string;
  }[];
  messages?: { templateKey: string; status: string; sentAt: Date | null; createdAt: Date }[];
};

export function serializeCustomerDetail(customer: CustomerDetailSource, role: WorkspaceRole): CustomerDetail {
  const showPII = canViewBookingPII(role);
  return {
    ...serializeCustomerListItem({ ...customer, _count: { bookings: customer.bookings?.length ?? 0 } }, role),
    country: customer.country,
    notes: showPII ? customer.notes : null,
    updatedAt: customer.updatedAt.toISOString(),
    bookings: (customer.bookings ?? []).map((b) => ({
      id: b.id,
      reference: b.reference,
      status: b.status,
      tourTitle: b.tourTitleSnapshot,
      departureStartsAt: b.departureStartsAt.toISOString(),
      totalAmount: b.totalAmount,
      currency: b.currency,
    })),
    messages: showPII
      ? (customer.messages ?? []).map((m) => ({
          templateKey: m.templateKey,
          status: m.status,
          sentAt: m.sentAt?.toISOString() ?? null,
          createdAt: m.createdAt.toISOString(),
        }))
      : [],
  };
}
