import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import type { Customer, Message, MessageTemplateKey } from "@prisma/client";
import { prisma, type Db } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit/audit-log";
import { logger } from "@/lib/observability/logger";
import {
  DEFAULT_MAX_ATTEMPTS,
  buildDedupeKey,
  findDueRetries,
  isOutboxPayload,
  nextRetryTime,
  recordDeliveryAttempt,
} from "./outbox";
import { getMailer, getFromAddress } from "./mailer";
import {
  bookingConfirmationEmail,
  bookingReminderEmail,
  reviewRequestEmail,
  memberInvitationEmail,
  departureDelayedEmail,
  emailVerificationEmail,
  passwordResetEmail,
  passwordChangedEmail,
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
 * hands the outcome to the outbox, which decides between `sent`, a scheduled
 * retry, and terminal failure. A failed or unconfigured mailer is always
 * tracked, never silent.
 *
 * Never throws: callers (booking creation, status transitions, the payment
 * webhook) call this only after their own transaction has already committed,
 * and a messaging failure must not be allowed to look like a failure of the
 * operation that triggered it — the same principle already applied to audit
 * logging in every prior phase.
 *
 * The dedupe key is what makes retries safe. Creating the row is the claim on
 * "this message is being handled"; the unique constraint means a concurrent
 * caller (a reminder sweep overlapping a manual resend, say) loses that race
 * in the database rather than by luck, and sends nothing.
 */
async function sendTrackedEmail(input: {
  workspaceId: string;
  bookingId?: string | null;
  customerId?: string | null;
  templateKey: MessageTemplateKey;
  to: string;
  fromName?: string | null;
  rendered: RenderedEmail;
  /**
   * Distinguishes otherwise-identical messages that are legitimately
   * repeatable — a delay notice can be sent more than once for one booking
   * if a departure slips twice, so its caller passes a discriminator.
   */
  dedupeDiscriminator?: string | null;
}): Promise<void> {
  const from = getFromAddress(input.fromName);
  const dedupeKey = buildDedupeKey({
    workspaceId: input.workspaceId,
    templateKey: input.templateKey,
    bookingId: input.bookingId,
    to: input.to,
    discriminator: input.dedupeDiscriminator,
  });

  let messageId: string;
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
        dedupeKey,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
        // Retained only while a retry is still possible — see outbox.ts.
        payload: {
          to: input.to,
          from,
          subject: input.rendered.subject,
          text: input.rendered.text,
          html: input.rendered.html,
        },
      },
    });
    messageId = message.id;
  } catch (error) {
    if (isDedupeCollision(error)) {
      // Someone else already owns this message. Not an error: the guest gets
      // exactly one email, which is the point.
      logger.debug("messaging.duplicate_suppressed", { templateKey: input.templateKey });
      return;
    }
    logger.error("messaging.queue_failed", { templateKey: input.templateKey }, error);
    return;
  }

  try {
    const result = await deliver(input.to, from, input.rendered);
    const updated = await recordDeliveryAttempt(messageId, result);
    if (updated.status === "failed") {
      logger.warn("messaging.delivery_failed", {
        messageId,
        templateKey: input.templateKey,
        attempts: updated.attempts,
        terminal: true,
      });
    }
  } catch (error) {
    // Delivery threw somewhere `deliver` does not cover, or the status write
    // failed. Leave the row claimable by the retry sweep rather than losing it.
    logger.error("messaging.attempt_failed", { messageId, templateKey: input.templateKey }, error);
    await prisma.message
      .update({
        where: { id: messageId },
        data: {
          status: "pending_retry",
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          nextRetryAt: nextRetryTime(1),
          errorMessage: error instanceof Error ? error.message : "Unknown delivery error",
        },
      })
      .catch(() => undefined);
  }
}

/** A unique-constraint violation on `dedupe_key` — someone else owns this message. */
function isDedupeCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes("dedupe_key")
  );
}

/**
 * Re-attempts delivery for one message the retry sweep has selected.
 *
 * Works from the stored payload rather than re-rendering: the booking may
 * have been edited since, and a reminder that arrives late should say what it
 * said when it was queued, not describe a departure the guest was never told
 * about. Returns whether the message ended up delivered.
 */
export async function retryMessageDelivery(message: Message): Promise<boolean> {
  if (!isOutboxPayload(message.payload)) {
    // Nothing to send from. Terminal rather than retried forever.
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "failed",
        nextRetryAt: null,
        errorMessage: "Stored payload is missing or unreadable; cannot retry",
      },
    });
    logger.warn("messaging.retry_payload_missing", { messageId: message.id });
    return false;
  }

  const payload = message.payload;
  const result = await deliver(payload.to, payload.from, {
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
  const updated = await recordDeliveryAttempt(message.id, result);
  return updated.status === "sent";
}

/**
 * The `messaging.retry-outbox` job body.
 *
 * Every message whose backoff has elapsed gets one more attempt. Failures are
 * per-message: one bad address cannot stop the rest of the backlog draining.
 */
export async function retryDueMessages(): Promise<{ scanned: number; sent: number; failed: number }> {
  const due = await findDueRetries();
  let sent = 0;
  let failed = 0;

  for (const message of due) {
    try {
      if (await retryMessageDelivery(message)) sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      logger.error("messaging.retry_failed", { messageId: message.id }, error);
    }
  }

  return { scanned: due.length, sent, failed };
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
    logger.error("messaging.skip_record_failed", { templateKey: input.templateKey }, error);
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

  // A departure can slip more than once, and each slip is a genuinely new
  // notice. Keying on the delay itself means a repeated *identical* notice
  // (an operator saving the same form twice) is suppressed, while a second,
  // different delay still reaches the guest.
  const discriminator = createHash("sha256")
    .update(`${delayMinutes ?? ""}|${opsMessage ?? ""}`)
    .digest("hex")
    .slice(0, 16);

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
      dedupeDiscriminator: discriminator,
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

/**
 * Phase 7 — account-security emails.
 *
 * Routed through the same tracked/retried outbox as everything else, so a
 * verification link lost to a transient SMTP outage is retried rather than
 * silently dropped. These are the emails where that matters most: a user who
 * never receives a reset link has no other way in.
 *
 * `workspaceId` is required by the Message model, so these resolve the user's
 * first workspace and fall back to a platform-scoped record when they have
 * none — which is the normal case for a just-registered account.
 */
async function workspaceIdForUser(userId: string): Promise<string | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, status: "active" },
    select: { workspaceId: true },
    orderBy: { joinedAt: "asc" },
  });
  return membership?.workspaceId ?? null;
}

async function sendAccountEmail(input: {
  userId: string;
  to: string;
  templateKey: MessageTemplateKey;
  rendered: RenderedEmail;
}): Promise<void> {
  const workspaceId = await workspaceIdForUser(input.userId);
  if (!workspaceId) {
    // No workspace yet (a brand-new registration). The Message table is
    // workspace-scoped, so there is nowhere to record it — send directly and
    // log the outcome rather than dropping the email. Losing a verification
    // link because the recipient has not created a workspace yet would break
    // the one flow every new account has to pass through.
    const result = await deliver(input.to, getFromAddress(null), input.rendered);
    logger.info("messaging.account_email", {
      templateKey: input.templateKey,
      status: result.status,
      tracked: false,
    });
    return;
  }

  await sendTrackedEmail({
    workspaceId,
    templateKey: input.templateKey,
    to: input.to,
    rendered: input.rendered,
    // Each issued token is a genuinely new email; the token itself is not in
    // the key (it must never be logged), so a per-issue discriminator keeps
    // successive requests distinct while a retry of one still dedupes.
    dedupeDiscriminator: `${Date.now()}`,
  });
}

export async function sendEmailVerificationEmail(input: {
  userId: string;
  to: string;
  name: string;
  verifyUrl: string;
  expiresAt: Date;
}): Promise<void> {
  await sendAccountEmail({
    userId: input.userId,
    to: input.to,
    templateKey: "email_verification",
    rendered: emailVerificationEmail({
      name: input.name,
      actionUrl: input.verifyUrl,
      expiresAt: input.expiresAt,
    }),
  });
}

export async function sendPasswordResetEmail(input: {
  userId: string;
  to: string;
  name: string;
  resetUrl: string;
  expiresAt: Date;
}): Promise<void> {
  await sendAccountEmail({
    userId: input.userId,
    to: input.to,
    templateKey: "password_reset",
    rendered: passwordResetEmail({
      name: input.name,
      actionUrl: input.resetUrl,
      expiresAt: input.expiresAt,
    }),
  });
}

export async function sendPasswordChangedEmail(input: {
  userId: string;
  to: string;
  name: string;
}): Promise<void> {
  await sendAccountEmail({
    userId: input.userId,
    to: input.to,
    templateKey: "password_changed",
    rendered: passwordChangedEmail({ name: input.name }),
  });
}
