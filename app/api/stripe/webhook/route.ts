import { badRequest, handleApiError, json } from "@/lib/api";
import { constructStripeEvent } from "@/lib/payments/stripe-client";
import { processStripeWebhookEvent } from "@/lib/payments/webhook-service";
import { isStripeBillingEvent, processStripeBillingWebhookEvent } from "@/lib/billing/webhook-service";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver — the only route in this app with no session or
 * tenant auth of its own; authenticity comes entirely from the signature
 * verified below. Reads the raw request body (never `request.json()`) since
 * Stripe's signature is computed over the exact raw bytes. Every DB write
 * this triggers is scoped by the `workspaceId` already stored on the
 * `Payment`/`Booking` rows it looks up — never from anything the payload
 * itself claims — so a valid event can never touch a different tenant's data.
 */
export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw badRequest("Missing Stripe-Signature header");

    const rawBody = await request.text();

    let event;
    try {
      event = constructStripeEvent(rawBody, signature);
    } catch {
      throw badRequest("Invalid webhook signature");
    }

    if (isStripeBillingEvent(event)) {
      const result = await processStripeBillingWebhookEvent(event);
      return json({ received: true, domain: "billing", duplicate: result.duplicate });
    }

    const result = await processStripeWebhookEvent(event);
    return json({ received: true, domain: "payments", duplicate: result.duplicate });
  } catch (error) {
    return handleApiError(error);
  }
}
