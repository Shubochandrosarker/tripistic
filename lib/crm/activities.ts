import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/api";

export type CreateActivityInput = {
  customerId?: string;
  leadId?: string;
  type?: "note" | "call" | "email" | "whatsapp" | "sms" | "meeting" | "status_change";
  subject?: string;
  body?: string;
  occurredAt?: Date;
  createdById?: string;
};

export async function createActivity(workspaceId: string, input: CreateActivityInput) {
  if (Boolean(input.customerId) === Boolean(input.leadId)) {
    throw badRequest("Link an activity to exactly one customer or lead.");
  }
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, workspaceId, deletedAt: null },
    });
    if (!customer) throw badRequest("That customer was not found in this workspace.");
  }
  if (input.leadId) {
    const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId } });
    if (!lead) throw badRequest("That lead was not found in this workspace.");
  }

  return prisma.crmActivity.create({
    data: {
      workspaceId,
      customerId: input.customerId ?? null,
      leadId: input.leadId ?? null,
      type: input.type ?? "note",
      subject: input.subject ?? null,
      body: input.body ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      createdById: input.createdById ?? null,
    },
  });
}

export type TimelineEntry = {
  kind: "booking" | "payment" | "message" | "activity";
  id: string;
  occurredAt: string;
  summary: string;
  detail?: string | null;
  status?: string | null;
};

/**
 * Merges bookings, payments, messages, and logged CrmActivity rows for one
 * customer into a single chronological feed — the "Customer Timeline"
 * (docs Phase 5 spec: bookings/emails/SMS/WhatsApp/calls/notes/invoices).
 * Each source table is queried independently (they're not a shared union
 * table) and merged/sorted in memory; `limit` bounds the combined result,
 * not each individual query, so a customer with many bookings and few
 * messages still gets a representative recent slice of everything.
 */
export async function buildCustomerTimeline(
  workspaceId: string,
  customerId: string,
  limit: number,
): Promise<TimelineEntry[]> {
  const fetchLimit = Math.max(limit, 25);

  const [bookings, payments, messages, activities] = await Promise.all([
    prisma.booking.findMany({
      where: { workspaceId, customerId },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      select: {
        id: true,
        reference: true,
        status: true,
        tourTitleSnapshot: true,
        totalAmount: true,
        currency: true,
        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { workspaceId, booking: { customerId } },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      select: { id: true, amount: true, currency: true, status: true, createdAt: true, bookingId: true },
    }),
    prisma.message.findMany({
      where: { workspaceId, customerId },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      select: { id: true, templateKey: true, subject: true, status: true, sentAt: true, createdAt: true },
    }),
    prisma.crmActivity.findMany({
      where: { workspaceId, customerId },
      orderBy: { occurredAt: "desc" },
      take: fetchLimit,
      select: { id: true, type: true, subject: true, body: true, occurredAt: true },
    }),
  ]);

  const entries: TimelineEntry[] = [
    ...bookings.map((b) => ({
      kind: "booking" as const,
      id: b.id,
      occurredAt: b.createdAt.toISOString(),
      summary: `Booking ${b.reference} — ${b.tourTitleSnapshot}`,
      detail: `${(b.totalAmount / 100).toFixed(2)} ${b.currency}`,
      status: b.status,
    })),
    ...payments.map((p) => ({
      kind: "payment" as const,
      id: p.id,
      occurredAt: p.createdAt.toISOString(),
      summary: `Payment — ${(p.amount / 100).toFixed(2)} ${p.currency}`,
      detail: p.bookingId,
      status: p.status,
    })),
    ...messages.map((m) => ({
      kind: "message" as const,
      id: m.id,
      occurredAt: m.createdAt.toISOString(),
      summary: m.subject ?? m.templateKey,
      detail: m.sentAt ? `Sent ${m.sentAt.toISOString()}` : null,
      status: m.status,
    })),
    ...activities.map((a) => ({
      kind: "activity" as const,
      id: a.id,
      occurredAt: a.occurredAt.toISOString(),
      summary: a.subject ?? a.type,
      detail: a.body,
      status: a.type,
    })),
  ];

  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return entries.slice(0, limit);
}
