import { z } from "zod";

import { badRequest, handleApiError, json } from "@/lib/api";
import {
  clientIpFrom,
  leadClientContext,
  markSubscriberDelivery,
  recordNewsletterSubscriber,
} from "@/lib/marketing/leads";
import { RATE_LIMITS, consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { getFromAddress, getMailer } from "@/lib/messaging/mailer";
import { SITE } from "@/lib/seo/site";

const subscribeSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  source: z.string().trim().max(64).optional(),
  // Honeypot: see the note in the contact route — validated loosely on
  // purpose so a filled trap returns a normal 202, not a telltale 400.
  website: z.string().max(200).optional(),
});


/**
 * Public newsletter subscription.
 *
 * The subscriber row is written **before** any delivery attempt, and the
 * response never claims an email was sent unless one was. Previously this
 * handler emailed the sales inbox and returned `{subscribed: true}` even with
 * SMTP unconfigured — so the address was logged and discarded while the UI
 * said "check your inbox".
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) throw badRequest("Invalid request body");

    const { email, source, website } = subscribeSchema.parse(body);

    // Honeypot: accept and discard silently so a bot cannot detect the trap.
    if (website) return json({ subscribed: true, confirmationSent: false }, 202);

    const ip = clientIpFrom(request.headers) ?? "unknown";
    // Phase 7 replaced the in-process limiter this used to call: that one gave
    // every container its own budget and reset on restart.
    const limit = await consumeRateLimit(RATE_LIMITS.newsletter, ip);
    if (!limit.allowed) {
      return json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: rateLimitHeaders(limit) },
      );
    }

    const client = leadClientContext(request.headers);
    const { id } = await recordNewsletterSubscriber({ email, source, client });

    let confirmationSent = false;
    if (process.env.SMTP_HOST) {
      try {
        const mailer = getMailer();
        await mailer.sendMail({
          from: getFromAddress(SITE.name),
          to: SITE.salesEmail,
          subject: `Newsletter subscription — ${email}`,
          text: [`Email: ${email}`, `Source: ${source ?? "unknown"}`].join("\n"),
        });
        await markSubscriberDelivery(id, { status: "sent" });
        confirmationSent = true;
      } catch (error) {
        // The subscriber is already stored; a delivery failure is recorded
        // against the row rather than losing the signup.
        await markSubscriberDelivery(id, {
          status: "failed",
          reason: error instanceof Error ? error.message : "Unknown delivery error",
        });
      }
    } else {
      await markSubscriberDelivery(id, {
        status: "skipped",
        reason: "SMTP is not configured",
      });
    }

    // Identical response whether or not the address was already on the list —
    // a distinguishable one would leak list membership.
    return json({ subscribed: true, confirmationSent }, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
