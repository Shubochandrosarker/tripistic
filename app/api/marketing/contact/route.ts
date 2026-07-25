import { z } from "zod";

import { badRequest, handleApiError, json } from "@/lib/api";
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
  website: z.string().max(0).optional(),
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
    if (data.website) return json({ received: true }, 202);

    const summary = [
      `Name: ${data.name}`,
      `Email: ${data.email}`,
      `Company: ${data.company || "—"}`,
      `Reason: ${data.reason}`,
      "",
      data.message,
    ].join("\n");

    if (process.env.SMTP_HOST) {
      const mailer = getMailer();
      await mailer.sendMail({
        from: getFromAddress(SITE.name),
        to: inboxFor(data.reason),
        replyTo: data.email,
        subject: `[${data.reason}] Website enquiry from ${data.name}`,
        text: summary,
      });
    } else {
      console.info("[marketing] contact enquiry (email delivery not configured):", {
        reason: data.reason,
        email: data.email,
      });
    }

    return json({ received: true }, 202);
  } catch (error) {
    return handleApiError(error);
  }
}
