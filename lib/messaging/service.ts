import type { Customer, MessageTemplateKey } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { getMailer, getFromAddress } from "./mailer";
import {
  bookingConfirmationEmail,
  bookingReminderEmail,
  reviewRequestEmail,
  memberInvitationEmail,
  departureDelayedEmail,
  type BookingEmailContext,
  type RenderedEmail,
} from "./templates";
import { generateUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function buildUnsubscribeUrl(customerId: string): string {
  return `${appBaseUrl()}/unsubscribe/${generateUnsubscribeToken(customerId)}`;
}

export function buildBookingConfirmationUrl(publicToken: string): string {
  return `${appBaseUrl()}/book/confirmation/${publicToken}`;
}

/**
 * Upserts a Customer profile deduped by (workspaceId, lowercased email),
 * called from inside `createBooking()`'s own transaction so the new/updated
 * profile and the booking that references it commit atomically. A repeat
 * booking refreshes name/phone from the latest submission but never
 * overwrites operator-entered notes/tags/consent.
 */
export async function upsertCustomerForBooking(
  tx: Db,
  input: { workspaceId: string; name: string; email: string; phone?: string | null },
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const customer = await tx.customer.upsert({
    where: { workspaceId_email: { workspaceId: input.workspaceId, email } },
    create: { workspaceId: input.workspaceId, name: input.name, email, phone: input.phone ?? null },
    update: {
      name: input.name,
      ...(input.phone ? { phone: input.phone } : {}),
    },
  });
  return customer.id;
}

type DeliverResult = { status: "sent" | "failed"; providerMessageId: string | null; errorMessage: string | null };

async function deliver(to: string, from: string, rendered: RenderedEmail): Promise<DeliverResult> {
  try {
    const info = await getMailer().sendMail({ from, to, subject: rendered.subject, text: rendered.text, html: rendered.html });
    const messageId = typeof info === "object" && info && "messageId" in info ? String(info.messageId) : null;
    return { status: "sent", providerMessageId: messageId, errorMessage: null };
  } catch (error) {
    // Covers both a real SMTP failure and getMailer() throwing because
    // SMTP_HOST isn't configured — the expected, graceful path in every
    // environment (including this one) that hasn't set up email yet.
    return {
      status: "failed",
      providerMessageId: null,
      errorMessage: error instanceof Error ? error.message : "Email delivery is not configured",
    };
  }
}

/**
 * Records a `Message` row first (status: queued), attempts delivery, then
 * updates the row with the outcome — a failed or unconfigured mailer is
 * always tracked, never silent. Never throws: callers (booking creation,
 * status transitions, the payment webhook) call this only after their own
 * transaction has already committed, and a messaging failure must not be
 * allowed to look like a failure of the operation that triggered it — the
 * same principle already applied to audit logging in every prior phase.
 */
async function sendTrackedEmail(input: {
  workspaceId: string;
  bookingId?: string | null;
  customerId?: string | null;
  templateKey: MessageTemplateKey;
  to: string;
  fromName?: string | null;
  rendered: RenderedEmail;
}): Promise<void> {
  try {
    const message = await prisma.message.create({
      data: {
        workspaceId: input.workspaceId,
        bookingId: input.bookingId ?? null,
        customerId: input.customerId ?? null,
        templateKey: input.templateKey,
        status: "queued",
        toEmail: input.to,
        subject: input.rendered.subject,
      },
    });

    const result = await deliver(input.to, getFromAddress(input.fromName), input.rendered);

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: result.status,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        sentAt: result.status === "sent" ? new Date() : null,
      },
    });
  } catch (error) {
    console.error("[messaging] failed to send/track email", input.templateKey, error);
  }
}

/** A marketing-flavored send skipped for an unsubscribed customer is still recorded — never silently dropped. */
async function recordSkippedMessage(input: {
  workspaceId: string;
  bookingId?: string | null;
  customerId?: string | null;
  templateKey: MessageTemplateKey;
  toEmail: string;
}): Promise<void> {
  try {
    await prisma.message.create({
      data: {
        workspaceId: input.workspaceId,
        bookingId: input.bookingId ?? null,
        customerId: input.customerId ?? null,
        templateKey: input.templateKey,
        status: "skipped",
        toEmail: input.toEmail,
        errorMessage: "Recipient has unsubscribed",
      },
    });
  } catch (error) {
    console.error("[messaging] failed to record a skipped message", input.templateKey, error);
  }
}

type BookingForEmail = {
  id: string;
  workspaceId: string;
  customerId: string | null;
  guestFirstName: string;
  guestEmail: string;
  reference: string;
  publicToken: string;
  tourTitleSnapshot: string;
  departureStartsAt: Date;
  locationSnapshot: string | null;
  meetingPointSnapshot: string | null;
  totalAmount: number;
  currency: string;
};

async function loadBookingForEmail(bookingId: string): Promise<{
  booking: BookingForEmail;
  workspaceName: string;
  timezone: string;
  fromName: string;
} | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      workspace: {
        select: { name: true, timezone: true, settings: { where: { key: "email_from_name" }, select: { value: true } } },
      },
    },
  });
  if (!booking) return null;

  return {
    booking,
    workspaceName: booking.workspace.name,
    timezone: booking.workspace.timezone,
    fromName: booking.workspace.settings[0]?.value ?? booking.workspace.name,
  };
}

function bookingEmailContext(booking: BookingForEmail, workspaceName: string, timezone: string): BookingEmailContext {
  return {
    workspaceName,
    guestFirstName: booking.guestFirstName,
    reference: booking.reference,
    tourTitle: booking.tourTitleSnapshot,
    departureStartsAt: booking.departureStartsAt,
    timezone,
    location: booking.locationSnapshot,
    meetingPoint: booking.meetingPointSnapshot,
    totalAmount: booking.totalAmount,
    currency: booking.currency,
    confirmationUrl: buildBookingConfirmationUrl(booking.publicToken),
  };
}

/** Called after commit from all three places a booking can become `confirmed` — see docs/19 §5. */
export async function sendBookingConfirmationEmail(bookingId: string): Promise<void> {
  const loaded = await loadBookingForEmail(bookingId);
  if (!loaded) return;
  const { booking, workspaceName, timezone, fromName } = loaded;

  await sendTrackedEmail({
    workspaceId: booking.workspaceId,
    bookingId: booking.id,
    customerId: booking.customerId,
    templateKey: "booking_confirmation",
    to: booking.guestEmail,
    fromName,
    rendered: bookingConfirmationEmail(bookingEmailContext(booking, workspaceName, timezone)),
  });
}

/** Called by the reminder sweep — transactional, never gated by consent. */
export async function sendBookingReminderEmail(bookingId: string): Promise<void> {
  const loaded = await loadBookingForEmail(bookingId);
  if (!loaded) return;
  const { booking, workspaceName, timezone, fromName } = loaded;

  await sendTrackedEmail({
    workspaceId: booking.workspaceId,
    bookingId: booking.id,
    customerId: booking.customerId,
    templateKey: "booking_reminder",
    to: booking.guestEmail,
    fromName,
    rendered: bookingReminderEmail(bookingEmailContext(booking, workspaceName, timezone)),
  });
}

/**
 * Called after a booking transitions to `completed`. The one
 * marketing-flavored send this phase introduces — gated on consent: skipped
 * (and recorded as such, not silently dropped) for a customer who has
 * unsubscribed. A booking with no linked customer record (a booking made
 * before Phase 5, or in some edge case with no email dedup possible) has no
 * consent status to gate on, so it sends.
 */
export async function sendReviewRequestEmail(bookingId: string): Promise<void> {
  const loaded = await loadBookingForEmail(bookingId);
  if (!loaded) return;
  const { booking, workspaceName, timezone, fromName } = loaded;

  if (booking.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: booking.customerId }, select: { consentStatus: true } });
    if (customer?.consentStatus === "unsubscribed") {
      await recordSkippedMessage({
        workspaceId: booking.workspaceId,
        bookingId: booking.id,
        customerId: booking.customerId,
        templateKey: "review_request",
        toEmail: booking.guestEmail,
      });
      return;
    }
  }

  await sendTrackedEmail({
    workspaceId: booking.workspaceId,
    bookingId: booking.id,
    customerId: booking.customerId,
    templateKey: "review_request",
    to: booking.guestEmail,
    fromName,
    rendered: reviewRequestEmail({
      ...bookingEmailContext(booking, workspaceName, timezone),
      unsubscribeUrl: booking.customerId ? buildUnsubscribeUrl(booking.customerId) : appBaseUrl(),
    }),
  });
}

/**
 * Phase 8/9 "Delayed Tour Automation" — sends a delay notice to every
 * confirmed guest on a departure. Called from
 * lib/operations/service.ts `transitionOpsStatus` when an operator marks a
 * departure `delayed` with notifyGuests enabled. Loops bookings
 * sequentially (departures rarely carry more than a few dozen bookings, and
 * each send is already independently tracked/non-throwing via
 * `sendTrackedEmail`), so one failed send never blocks the rest.
 */
export async function sendDepartureDelayedNotices(
  availabilityId: string,
  delayMinutes: number | null,
  opsMessage: string | null,
): Promise<number> {
  const bookings = await prisma.booking.findMany({
    where: { availabilityId, status: "confirmed" },
    select: { id: true },
  });

  let sent = 0;
  for (const { id: bookingId } of bookings) {
    const loaded = await loadBookingForEmail(bookingId);
    if (!loaded) continue;
    const { booking, workspaceName, timezone, fromName } = loaded;

    await sendTrackedEmail({
      workspaceId: booking.workspaceId,
      bookingId: booking.id,
      customerId: booking.customerId,
      templateKey: "departure_delayed",
      to: booking.guestEmail,
      fromName,
      rendered: departureDelayedEmail({
        ...bookingEmailContext(booking, workspaceName, timezone),
        delayMinutes,
        opsMessage,
      }),
    });
    sent += 1;
  }
  return sent;
}

export async function sendMemberInvitationEmail(input: {
  workspaceId: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  email: string;
  inviteUrl: string;
  expiresAt: Date;
}): Promise<void> {
  await sendTrackedEmail({
    workspaceId: input.workspaceId,
    templateKey: "member_invitation",
    to: input.email,
    fromName: input.workspaceName,
    rendered: memberInvitationEmail({
      workspaceName: input.workspaceName,
      inviterName: input.inviterName,
      role: input.role,
      inviteUrl: input.inviteUrl,
      expiresAt: input.expiresAt,
    }),
  });
}

export type ApplyUnsubscribeResult =
  | { status: "invalid" }
  | { status: "already_unsubscribed"; customer: Customer }
  | { status: "unsubscribed"; customer: Customer };

/**
 * The DB-mutating half of `GET /unsubscribe/[token]` — kept out of the page
 * component itself so it's directly testable without rendering a Server
 * Component. Idempotent: a second visit with the same token returns
 * `already_unsubscribed` rather than erroring or writing again.
 */
export async function applyUnsubscribeToken(token: string): Promise<ApplyUnsubscribeResult> {
  const customerId = verifyUnsubscribeToken(token);
  if (!customerId) return { status: "invalid" };

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.deletedAt) return { status: "invalid" };

  if (customer.consentStatus === "unsubscribed") {
    return { status: "already_unsubscribed", customer };
  }

  const updated = await prisma.customer.update({
    where: { id: customer.id },
    data: { consentStatus: "unsubscribed" },
  });
  await recordAuditEvent({
    action: "customer_unsubscribed",
    workspaceId: customer.workspaceId,
    userId: null,
    entityType: "customer",
    entityId: customer.id,
  });

  return { status: "unsubscribed", customer: updated };
}
