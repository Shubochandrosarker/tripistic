import type Stripe from "stripe";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/api";
import { DEFAULT_PAYMENT_PENDING_EXPIRY_MINUTES, STRIPE_MIN_CHECKOUT_SESSION_MINUTES } from "@/lib/constants";
import type { BookingWithRelations } from "@/lib/bookings/service";
import { getStripeClient, toStripeAmount } from "./stripe-client";
import {
  calculatePlatformFeeAmount,
  connectedPaymentIntentData,
  getChargeReadyPaymentAccount,
} from "@/lib/payments/connect";

export function getPaymentExpiryMinutes(): number {
  const raw = Number(process.env.PAYMENT_PENDING_EXPIRY_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PAYMENT_PENDING_EXPIRY_MINUTES;
}

function appBaseUrl(kind: "success" | "cancel"): string {
  const configured = kind === "success" ? process.env.STRIPE_SUCCESS_URL : process.env.STRIPE_CANCEL_URL;
  const base = configured || process.env.APP_URL || "http://localhost:3000";
  return base.replace(/\/+$/, "");
}

export function buildBookingSuccessUrl(publicToken: string): string {
  return `${appBaseUrl("success")}/book/confirmation/${publicToken}?payment=success`;
}

export function buildBookingCancelUrl(publicToken: string, workspaceSlug?: string, tourSlug?: string): string {
  if (workspaceSlug && tourSlug) {
    return `${appBaseUrl("cancel")}/book/${workspaceSlug}/${tourSlug}?payment=cancelled`;
  }
  return `${appBaseUrl("cancel")}/book/confirmation/${publicToken}?payment=cancelled`;
}

export async function getLatestPaymentForBooking(workspaceId: string, bookingId: string): Promise<Payment | null> {
  return prisma.payment.findFirst({ where: { workspaceId, bookingId }, orderBy: { createdAt: "desc" } });
}

/**
 * Creates a fresh Stripe Checkout Session for a booking's full outstanding
 * total and records it as a new `Payment` row. One line item for the base
 * party price plus one per add-on selection, so the Stripe-hosted page (and
 * its emailed receipt) itemizes the same way the confirmation page does.
 * Never called for a booking with nothing to charge — callers check
 * `totalAmount > 0` before reaching here (a free booking is confirmed
 * immediately by `createBooking()` and never gets a Payment row at all).
 */
export async function createCheckoutSessionForBooking(
  booking: BookingWithRelations,
  urls: { successUrl: string; cancelUrl: string },
  expiryMinutes: number = getPaymentExpiryMinutes(),
): Promise<Payment> {
  if (booking.totalAmount <= 0) {
    throw badRequest("This booking has nothing to charge.");
  }

  const stripe = getStripeClient();
  const currency = booking.currency.toLowerCase();
  const paymentAccount = await getChargeReadyPaymentAccount(booking.workspaceId);
  const platformFeeAmount = calculatePlatformFeeAmount(booking.totalAmount, paymentAccount.platformFeeBps);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency,
        product_data: {
          name: `${booking.tourTitleSnapshot} — party of ${booking.participantCount}`,
        },
        unit_amount: toStripeAmount(booking.subtotal, booking.currency),
      },
      quantity: 1,
    },
    ...booking.addonSelections.map((addon) => ({
      price_data: {
        currency,
        product_data: { name: `${addon.nameSnapshot} × ${addon.quantity}` },
        unit_amount: toStripeAmount(addon.totalPrice, booking.currency),
      },
      quantity: 1,
    })),
  ];

  const expiresAtSeconds =
    Math.floor(Date.now() / 1000) + Math.max(expiryMinutes, STRIPE_MIN_CHECKOUT_SESSION_MINUTES) * 60;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    client_reference_id: booking.id,
    expires_at: expiresAtSeconds,
    metadata: {
      bookingId: booking.id,
      workspaceId: booking.workspaceId,
      bookingReference: booking.reference,
    },
    payment_intent_data: {
      ...connectedPaymentIntentData({ booking, paymentAccount }),
    },
  });

  return prisma.payment.create({
    data: {
      workspaceId: booking.workspaceId,
      bookingId: booking.id,
      provider: "stripe",
      paymentAccountId: paymentAccount.id,
      providerCheckoutSessionId: session.id,
      providerPaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      providerConnectedAccountId: paymentAccount.providerAccountId,
      amount: booking.totalAmount,
      currency: booking.currency,
      platformFeeAmount,
      status: "requires_payment",
      expiresAt: new Date(expiresAtSeconds * 1000),
      metadata: { checkoutUrl: session.url },
    },
  });
}

/**
 * Reuses the booking's latest payment session if it's still open and
 * unexpired (an idempotent-replay booking-create call, or a guest reloading
 * the confirmation page, should never spawn a second Checkout Session for
 * the same attempt); otherwise creates a fresh one. This is the one
 * function both the public booking-create route and the explicit retry
 * endpoint call.
 */
export async function ensureCheckoutSessionForBooking(
  booking: BookingWithRelations,
  urls: { successUrl: string; cancelUrl: string },
  expiryMinutes: number = getPaymentExpiryMinutes(),
): Promise<Payment> {
  const latest = await getLatestPaymentForBooking(booking.workspaceId, booking.id);
  const reusable =
    latest &&
    (latest.status === "requires_payment" || latest.status === "processing") &&
    latest.expiresAt &&
    latest.expiresAt.getTime() > Date.now();
  if (reusable && latest) return latest;
  return createCheckoutSessionForBooking(booking, urls, expiryMinutes);
}

export function checkoutUrlFromPayment(payment: Payment): string | null {
  const metadata = payment.metadata as { checkoutUrl?: string } | null;
  return metadata?.checkoutUrl ?? null;
}
