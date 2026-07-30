import { z } from "zod";

import { badRequest, handleApiError, json } from "@/lib/api";
import {
  clientIpFrom,
  leadClientContext,
  markContactDelivery,
  recordContactSubmission,
} from "@/lib/marketing/leads";
import { RATE_LIMITS, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { getFromAddress, getMailer } from "@/lib/messaging/mailer";
import { SITE } from "@/lib/seo/site";


const REASONS = [
  "Sales",
  "Support",
  "Partnership",
  "Media",
  "General Inquiry",
] as const;

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address").max(254),
  company: z.string().trim().max(160).optional(),
  reason: z.enum(REASONS),
  message: z.string().trim().min(10, "Please add a little more detail").max(5000),
  // Honeypot: real users never fill this. Bots usually do.
  //
  // Accepts any short string rather than enforcing max(0): a zod rejection
  // would return 400 and tell the bot it was caught, defeating the trap. The
  // explicit check in the handler discards these with a normal 202 instead.
  website: z.string().max(200).optional(),
});

/** Routes an enquiry to the right inbox based on the selected reason. */
function inboxFor(reason: (typeof REASONS)[number]): string {
  switch (reason) {
    case "Sales":
    case "Partnership":
      return SITE.salesEmail;
    case "Support":
      return SITE.supportEmail;
    default:
      return SITE.salesEmail;
  }
}

/**
 * Public contact form handler. Delivery is an optional integration, matching
 * `lib/messaging/mailer.ts`: with SMTP configured the enquiry is emailed, and
 * without it the submission is logged so the form still works in preview and
 * local environments.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) throw badRequest("Invalid request body");

    const data = contactSchema.parse(body);

    // Silently accept honeypot hits so bots do not learn they were caught.
    if (data.website) return json({ received: true, notified: false }, 202);

    const ip = clientIpFrom(request.headers) ?? "unknown";
    // Phase 7 replaced the in-process limiter this used to call: that one gave
    // every container its own budget and reset on restart.
    const limit = await consumeRateLimit(RATE_LIMITS.contactForm, ip);
    if (!limit.allowed) {
      return json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    // Persist first. An enquiry that reaches us is never lost to a mail
    // failure or an unconfigured SMTP host.
    const client = leadClientContext(request.headers);
    const submission = await recordContactSubmission({
      name: data.name,
      email: data.email,
      company: data.company,
      reason: data.reason,
      message: data.message,
      client,
    });

    const summary = [
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Company: ${data.company || "—"}`,
      `Reason: ${data.reason}`,
      "",
      data.message,
    ].join("\n");

    let notified = false;
    if (process.env.SMTP_HOST) {
      try {
        const mailer = getMailer();
        await mailer.sendMail({
          from: getFromAddress(SITE.name),
          to: inboxFor(data.reason),
          replyTo: data.email,
          subject: `[${data.reason}] Website enquiry from ${data.name}`,
          text: summary,
        });
        await markContactDelivery(submission.id, { status: "sent" });
        notified = true;
      } catch (error) {
        await markContactDelivery(submission.id, {
          status: "failed",
          reason: error instanceof Error ? error.message : "Unknown delivery error",
        });
      }
    } else {
      await markContactDelivery(submission.id, {
        status: "skipped",
        reason: "SMTP is not configured",
      });
    }

    return json({ received: true, notified }, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
