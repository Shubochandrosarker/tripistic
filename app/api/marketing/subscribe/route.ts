import { z } from "zod";

import { badRequest, handleApiError, json } from "@/lib/api";
import { getFromAddress, getMailer } from "@/lib/messaging/mailer";
import { SITE } from "@/lib/seo/site";

const subscribeSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  source: z.string().trim().max(64).optional(),
});

/**
 * Public newsletter subscription for the marketing site.
 *
 * Delivery follows the same optional-integration convention as the rest of the
 * messaging layer: when SMTP is configured the notification is sent, otherwise
 * the submission is logged and the caller still receives a success response so
 * the marketing site works in environments without email configured.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) throw badRequest("Invalid request body");

    const { email, source } = subscribeSchema.parse(body);

    if (process.env.SMTP_HOST) {
      const mailer = getMailer();
      await mailer.sendMail({
        from: getFromAddress(SITE.name),
        to: SITE.salesEmail,
        subject: `Newsletter subscription — ${email}`,
        text: [`Email: ${email}`, `Source: ${source ?? "unknown"}`].join("\n"),
      });
    } else {
      console.info("[marketing] newsletter subscription (email delivery not configured):", {
        email,
        source,
      });
    }

    return json({ subscribed: true }, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
