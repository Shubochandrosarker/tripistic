import Stripe from "stripe";
import { ZERO_DECIMAL_CURRENCIES } from "@/lib/constants";

let cachedClient: Stripe | null = null;

/**
 * Constructed lazily, on first use inside a route/service call — never at
 * module load. This matches the rest of the app's "optional integration"
 * convention (see `.env.example`'s header comment): every route that
 * doesn't touch payments must keep working with no Stripe key configured.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured — online payment collection is unavailable until it is set.",
    );
  }
  // Pinned to the version bundled with the installed `stripe` package
  // (node_modules/stripe/cjs/apiVersion.d.ts) — bump together when the
  // dependency is upgraded, rather than floating on the Stripe account's
  // dashboard-configured default.
  cachedClient = new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" });
  return cachedClient;
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured — webhook events cannot be verified.");
  }
  return secret;
}

/**
 * Verifies a raw webhook payload against its Stripe-Signature header and
 * returns the parsed event. Throws (caller returns 400) on any signature
 * mismatch — this is the entire trust boundary for the webhook route, since
 * it has no session/tenant auth of its own.
 */
export function constructStripeEvent(rawBody: string, signature: string): Stripe.Event {
  return getStripeClient().webhooks.constructEvent(rawBody, signature, getWebhookSecret());
}

/**
 * This app stores every money value as an integer "cents"-style minor unit,
 * uniformly across all currencies (see docs/03 and `formatMoney` in
 * lib/utils.ts, which always divides by 100 for display) — including
 * currencies Stripe treats as zero-decimal (JPY, KRW, ...), where Stripe
 * instead expects the literal major-unit integer with no division. Passing
 * our stored value straight through for those currencies would make Stripe
 * charge 100x what the rest of the app displays as the price. This
 * converts our storage convention to Stripe's per-currency convention;
 * for every ordinary (non-zero-decimal) currency it's a no-op passthrough.
 */
export function toStripeAmount(amountInStoredMinorUnits: number, currency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) {
    return Math.round(amountInStoredMinorUnits / 100);
  }
  return amountInStoredMinorUnits;
}
