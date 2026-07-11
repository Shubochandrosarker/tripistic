import { Prisma, type Booking, type BookingSource, type BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/api";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { uniqueViolationTargets } from "@/lib/prisma-errors";
import { generateBookingReference, generatePublicToken } from "./reference";

export type BookingParticipantInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  notes?: string;
};

export type BookingAddonSelectionInput = {
  tourAddonId: string;
  quantity: number;
};

export type CreateBookingInput = {
  /** Resolved and verified by the caller (slug lookup for public, membership for manual) — re-verified again here, never trusted as final. */
  workspaceId: string;
  tourId: string;
  availabilityId: string;
  participantCount: number;
  participants: BookingParticipantInput[];
  guestFirstName: string;
  guestLastName: string;
  guestEmail: string;
  guestPhone?: string;
  guestNotes?: string;
  addons: BookingAddonSelectionInput[];
  idempotencyKey?: string;
  source: BookingSource;
  /** Public bookings must only ever resolve a `visibility: public` tour. */
  requirePublicVisibility: boolean;
  /** Manual bookings only. Public bookings always land as `confirmed`. */
  status?: Extract<BookingStatus, "pending" | "confirmed">;
  createdById?: string;
  operatorNotes?: string;
};

export type BookingWithRelations = Booking & {
  participants: Prisma.BookingParticipantGetPayload<object>[];
  addonSelections: Prisma.BookingAddonSelectionGetPayload<object>[];
};

export type CreateBookingResult = {
  booking: BookingWithRelations;
  /** True when this call returned an existing booking instead of creating a new one (idempotency replay). */
  idempotentReplay: boolean;
};

const MAX_REFERENCE_ATTEMPTS = 5;

const BOOKING_INCLUDE = { participants: true, addonSelections: true } as const;

function isIdempotencyKeyViolation(error: unknown): boolean {
  return uniqueViolationTargets(error).some((t) => /idempotency/i.test(t));
}

function isReferenceOrTokenViolation(error: unknown): boolean {
  return uniqueViolationTargets(error).some((t) => /reference|token/i.test(t));
}

async function findByIdempotencyKey(workspaceId: string, idempotencyKey: string) {
  return prisma.booking.findFirst({
    where: { workspaceId, idempotencyKey },
    include: BOOKING_INCLUDE,
  });
}

/**
 * The one canonical booking-creation path. Both the public booking API and
 * the authenticated manual-booking API build a `CreateBookingInput` and call
 * this — no reservation, pricing, or capacity logic is duplicated anywhere
 * else. See docs/14_PHASE_3_IMPLEMENTATION_PLAN.md §7 for the full design
 * rationale.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  if (input.participantCount !== input.participants.length) {
    throw badRequest("The number of participants must match the party size.");
  }

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input.workspaceId, input.idempotencyKey);
    if (existing) return { booking: existing, idempotentReplay: true };
  }

  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    try {
      const booking = await prisma.$transaction((tx) => reserveAndCreate(tx, input));
      await recordAuditEvent({
        action: input.source === "manual" ? "booking_created_manual" : "booking_created",
        workspaceId: input.workspaceId,
        userId: input.createdById ?? null,
        entityType: "booking",
        entityId: booking.id,
        metadata: {
          reference: booking.reference,
          tourId: booking.tourId,
          availabilityId: booking.availabilityId,
          participantCount: booking.participantCount,
          source: booking.source,
        },
      });
      return { booking, idempotentReplay: false };
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyViolation(error)) {
        // Lost a race to a concurrent identical submission — the winner's
        // transaction already committed; return it instead of erroring.
        const existing = await findByIdempotencyKey(input.workspaceId, input.idempotencyKey);
        if (existing) return { booking: existing, idempotentReplay: true };
      }
      if (isReferenceOrTokenViolation(error)) {
        // Astronomically unlikely random collision — retry with fresh values.
        continue;
      }
      throw error;
    }
  }

  throw new Error("createBooking: exhausted retry attempts generating a unique reference");
}

async function reserveAndCreate(
  tx: Prisma.TransactionClient,
  input: CreateBookingInput,
): Promise<BookingWithRelations> {
  const workspace = await tx.workspace.findFirst({
    where: { id: input.workspaceId, status: "active", deletedAt: null },
  });
  if (!workspace) throw notFound("This workspace is not accepting bookings.");

  const tour = await tx.tour.findFirst({
    where: {
      id: input.tourId,
      workspaceId: input.workspaceId,
      deletedAt: null,
      status: "active",
      ...(input.requirePublicVisibility ? { visibility: "public" as const } : {}),
    },
  });
  if (!tour) throw notFound("This tour is not available for booking.");

  const availability = await tx.availability.findFirst({
    where: {
      id: input.availabilityId,
      workspaceId: input.workspaceId,
      tourId: input.tourId,
      status: "scheduled",
      startsAt: { gt: new Date() },
    },
  });
  if (!availability) throw notFound("This departure is not available for booking.");

  if (input.participantCount < 1 || input.participantCount > 50) {
    throw badRequest("Invalid party size.");
  }

  const addonIds = [...new Set(input.addons.map((a) => a.tourAddonId))];
  const addonRows =
    addonIds.length > 0
      ? await tx.tourAddon.findMany({
          where: { id: { in: addonIds }, tourId: input.tourId, workspaceId: input.workspaceId, isActive: true },
        })
      : [];
  const addonById = new Map(addonRows.map((row) => [row.id, row]));

  const addonLines = input.addons.map((selection) => {
    const addon = addonById.get(selection.tourAddonId);
    if (!addon) throw badRequest("One of the selected add-ons is no longer available.");
    if (!Number.isInteger(selection.quantity) || selection.quantity < 1) {
      throw badRequest("Add-on quantity must be a positive whole number.");
    }
    if (addon.maxPerBooking != null && selection.quantity > addon.maxPerBooking) {
      throw badRequest(`"${addon.name}" allows at most ${addon.maxPerBooking} per booking.`);
    }
    return { addon, quantity: selection.quantity, totalPrice: addon.price * selection.quantity };
  });

  // Authoritative, server-only pricing — the request body has no price/total fields to ignore in the first place.
  const unitPrice = availability.priceOverride ?? tour.basePrice;
  const subtotal = unitPrice * input.participantCount;
  const addonsTotal = addonLines.reduce((sum, line) => sum + line.totalPrice, 0);
  const totalAmount = subtotal + addonsTotal;

  // Atomic capacity reservation: one conditional UPDATE, guarded by the same
  // WHERE clause that re-validates tenant scope, schedule status, and future
  // start time. Postgres takes the row lock here, so concurrent reservations
  // against the same departure serialize on this statement — never a
  // read-then-write race. Zero rows back means genuinely no room left.
  const reserved = await tx.$queryRaw<{ id: string }[]>`
    UPDATE availabilities
    SET booked_count = booked_count + ${input.participantCount}, updated_at = now()
    WHERE id = ${availability.id}
      AND workspace_id = ${input.workspaceId}
      AND tour_id = ${input.tourId}
      AND status = 'scheduled'
      AND starts_at > now()
      AND booked_count + ${input.participantCount} <= capacity
    RETURNING id
  `;
  if (reserved.length === 0) {
    throw conflict(
      "That departure no longer has enough remaining seats. Please choose another time or reduce the group size.",
    );
  }

  // Phase 4: a public booking with something to charge starts `pending` and
  // is only moved to `confirmed` by a verified Stripe webhook (see
  // lib/payments/webhook-service.ts) — never on form submission. A free
  // booking (totalAmount === 0) has nothing to wait for and confirms
  // immediately, exactly as every public booking did before Phase 4. Manual
  // (operator) bookings are unaffected — they keep landing in whatever
  // status the operator explicitly chose.
  const status: BookingStatus =
    input.source === "public_direct" ? (totalAmount > 0 ? "pending" : "confirmed") : input.status ?? "confirmed";
  const now = new Date();

  const booking = await tx.booking.create({
    data: {
      workspaceId: input.workspaceId,
      tourId: tour.id,
      availabilityId: availability.id,
      reference: generateBookingReference(),
      publicToken: generatePublicToken(),
      idempotencyKey: input.idempotencyKey ?? null,
      source: input.source,
      status,
      guestFirstName: input.guestFirstName,
      guestLastName: input.guestLastName,
      guestEmail: input.guestEmail.trim().toLowerCase(),
      guestPhone: input.guestPhone ?? null,
      guestNotes: input.guestNotes ?? null,
      operatorNotes: input.operatorNotes ?? null,
      participantCount: input.participantCount,
      tourTitleSnapshot: tour.title,
      locationSnapshot: tour.location,
      meetingPointSnapshot: tour.meetingPoint,
      departureStartsAt: availability.startsAt,
      departureEndsAt: availability.endsAt,
      unitPrice,
      subtotal,
      addonsTotal,
      totalAmount,
      currency: tour.currency,
      cancellationPolicySnapshot: tour.cancellationPolicy,
      termsAcceptedAt: now,
      confirmedAt: status === "confirmed" ? now : null,
      createdById: input.createdById ?? null,
      // workspaceId is intentionally omitted from these nested creates —
      // it's part of each child's composite (workspaceId, bookingId) FK
      // back to this Booking, so Prisma derives it from the parent Booking
      // being created here rather than accepting it as an independent
      // scalar (which would risk a child row disagreeing with its parent).
      participants: {
        create: input.participants.map((participant, index) => ({
          firstName: participant.firstName,
          lastName: participant.lastName,
          email: participant.email ?? null,
          phone: participant.phone ?? null,
          notes: participant.notes ?? null,
          isLead: index === 0,
        })),
      },
      addonSelections: {
        create: addonLines.map((line) => ({
          tourAddonId: line.addon.id,
          nameSnapshot: line.addon.name,
          unitPrice: line.addon.price,
          quantity: line.quantity,
          totalPrice: line.totalPrice,
        })),
      },
      statusEvents: {
        create: {
          fromStatus: null,
          toStatus: status,
          actorUserId: input.createdById ?? null,
        },
      },
    },
    include: BOOKING_INCLUDE,
  });

  return booking;
}
