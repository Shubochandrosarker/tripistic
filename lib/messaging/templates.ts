import { formatDateTimeInTz, formatMoney } from "@/lib/utils";

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One small shared wrapper so every email looks like it came from the same product, without a templating dependency. */
function wrapHtml(workspaceName: string, bodyHtml: string, footerHtml?: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:24px;border-bottom:1px solid #e4e4e7;">
        <strong style="font-size:15px;">${escapeHtml(workspaceName)}</strong>
      </td></tr>
      <tr><td style="padding:24px;font-size:14px;line-height:1.6;">${bodyHtml}</td></tr>
      ${footerHtml ? `<tr><td style="padding:16px 24px;border-top:1px solid #e4e4e7;font-size:11px;color:#71717a;">${footerHtml}</td></tr>` : ""}
    </table>
  </body>
</html>`;
}

export type BookingEmailContext = {
  workspaceName: string;
  guestFirstName: string;
  reference: string;
  tourTitle: string;
  departureStartsAt: Date;
  timezone: string;
  location: string | null;
  meetingPoint: string | null;
  totalAmount: number;
  currency: string;
  confirmationUrl: string;
};

export function bookingConfirmationEmail(ctx: BookingEmailContext): RenderedEmail {
  const departure = formatDateTimeInTz(ctx.departureStartsAt, ctx.timezone);
  const subject = `Booking confirmed — ${ctx.tourTitle} (${ctx.reference})`;
  const text = [
    `Hi ${ctx.guestFirstName},`,
    ``,
    `Your booking for ${ctx.tourTitle} is confirmed.`,
    ``,
    `Reference: ${ctx.reference}`,
    `Departure: ${departure}`,
    ctx.location ? `Location: ${ctx.location}` : null,
    ctx.meetingPoint ? `Meeting point: ${ctx.meetingPoint}` : null,
    `Total: ${formatMoney(ctx.totalAmount, ctx.currency)}`,
    ``,
    `View your booking: ${ctx.confirmationUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = wrapHtml(
    ctx.workspaceName,
    `<p>Hi ${escapeHtml(ctx.guestFirstName)},</p>
     <p>Your booking for <strong>${escapeHtml(ctx.tourTitle)}</strong> is confirmed.</p>
     <table role="presentation" style="width:100%;font-size:13px;margin:16px 0;">
       <tr><td style="color:#71717a;padding:4px 0;">Reference</td><td style="text-align:right;font-family:monospace;">${escapeHtml(ctx.reference)}</td></tr>
       <tr><td style="color:#71717a;padding:4px 0;">Departure</td><td style="text-align:right;">${escapeHtml(departure)}</td></tr>
       ${ctx.location ? `<tr><td style="color:#71717a;padding:4px 0;">Location</td><td style="text-align:right;">${escapeHtml(ctx.location)}</td></tr>` : ""}
       ${ctx.meetingPoint ? `<tr><td style="color:#71717a;padding:4px 0;">Meeting point</td><td style="text-align:right;">${escapeHtml(ctx.meetingPoint)}</td></tr>` : ""}
       <tr><td style="color:#71717a;padding:4px 0;">Total</td><td style="text-align:right;font-weight:600;">${escapeHtml(formatMoney(ctx.totalAmount, ctx.currency))}</td></tr>
     </table>
     <p><a href="${ctx.confirmationUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">View your booking</a></p>`,
  );

  return { subject, text, html };
}

export function bookingReminderEmail(ctx: BookingEmailContext): RenderedEmail {
  const departure = formatDateTimeInTz(ctx.departureStartsAt, ctx.timezone);
  const subject = `Reminder — ${ctx.tourTitle} departs soon (${ctx.reference})`;
  const text = [
    `Hi ${ctx.guestFirstName},`,
    ``,
    `This is a reminder that ${ctx.tourTitle} departs within the next 24 hours.`,
    ``,
    `Reference: ${ctx.reference}`,
    `Departure: ${departure}`,
    ctx.location ? `Location: ${ctx.location}` : null,
    ctx.meetingPoint ? `Meeting point: ${ctx.meetingPoint}` : null,
    ``,
    `View your booking: ${ctx.confirmationUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const html = wrapHtml(
    ctx.workspaceName,
    `<p>Hi ${escapeHtml(ctx.guestFirstName)},</p>
     <p>This is a reminder that <strong>${escapeHtml(ctx.tourTitle)}</strong> departs within the next 24 hours.</p>
     <table role="presentation" style="width:100%;font-size:13px;margin:16px 0;">
       <tr><td style="color:#71717a;padding:4px 0;">Reference</td><td style="text-align:right;font-family:monospace;">${escapeHtml(ctx.reference)}</td></tr>
       <tr><td style="color:#71717a;padding:4px 0;">Departure</td><td style="text-align:right;">${escapeHtml(departure)}</td></tr>
       ${ctx.location ? `<tr><td style="color:#71717a;padding:4px 0;">Location</td><td style="text-align:right;">${escapeHtml(ctx.location)}</td></tr>` : ""}
       ${ctx.meetingPoint ? `<tr><td style="color:#71717a;padding:4px 0;">Meeting point</td><td style="text-align:right;">${escapeHtml(ctx.meetingPoint)}</td></tr>` : ""}
     </table>
     <p><a href="${ctx.confirmationUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">View your booking</a></p>`,
  );

  return { subject, text, html };
}

export type ReviewRequestContext = BookingEmailContext & { unsubscribeUrl: string };

export function reviewRequestEmail(ctx: ReviewRequestContext): RenderedEmail {
  const subject = `How was ${ctx.tourTitle}?`;
  const text = [
    `Hi ${ctx.guestFirstName},`,
    ``,
    `Thanks for joining ${ctx.tourTitle} with ${ctx.workspaceName}. We'd love to hear how it went — reply to this email and let us know.`,
    ``,
    `Reference: ${ctx.reference}`,
    ``,
    `Don't want emails like this? Unsubscribe: ${ctx.unsubscribeUrl}`,
  ].join("\n");

  const html = wrapHtml(
    ctx.workspaceName,
    `<p>Hi ${escapeHtml(ctx.guestFirstName)},</p>
     <p>Thanks for joining <strong>${escapeHtml(ctx.tourTitle)}</strong> with ${escapeHtml(ctx.workspaceName)}. We'd love to hear how it went — just reply to this email.</p>`,
    `Reference ${escapeHtml(ctx.reference)}. <a href="${ctx.unsubscribeUrl}" style="color:#71717a;">Unsubscribe</a> from emails like this.`,
  );

  return { subject, text, html };
}

export type InvitationEmailContext = {
  workspaceName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
};

export function memberInvitationEmail(ctx: InvitationEmailContext): RenderedEmail {
  const subject = `${ctx.inviterName} invited you to join ${ctx.workspaceName} on Tripistic`;
  const text = [
    `${ctx.inviterName} invited you to join ${ctx.workspaceName} on Tripistic as ${ctx.role.replace(/_/g, " ")}.`,
    ``,
    `Accept the invitation: ${ctx.inviteUrl}`,
    ``,
    `This link expires ${ctx.expiresAt.toDateString()}.`,
  ].join("\n");

  const html = wrapHtml(
    ctx.workspaceName,
    `<p><strong>${escapeHtml(ctx.inviterName)}</strong> invited you to join <strong>${escapeHtml(ctx.workspaceName)}</strong> on Tripistic as ${escapeHtml(ctx.role.replace(/_/g, " "))}.</p>
     <p><a href="${ctx.inviteUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Accept invitation</a></p>`,
    `This link expires ${escapeHtml(ctx.expiresAt.toDateString())}.`,
  );

  return { subject, text, html };
}
