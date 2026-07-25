---
title: Payments
description: Stripe setup, checkout and payment links, webhook verification, deposits, refunds, expiry sweeps, and reconciliation.
eyebrow: Commerce
category: Operations
icon: card
order: 5
publishedAt: 2026-07-01
---

Tripistic uses Stripe for all traveller payments. Money moves directly into **your** Stripe account — Tripistic is not the merchant of record and never holds your funds.

## Setup

1. Go to **Settings → Payments**.
2. Connect your Stripe account.
3. Confirm the currency matches your workspace currency.
4. Choose your default payment mode.
5. Set the pending-payment expiry window.
6. Run a test booking in Stripe test mode before enabling live payments.

## Payment modes

| Mode | Traveller experience | Use when |
| --- | --- | --- |
| Full payment | Pays the total at checkout | Standard day tours |
| Deposit | Pays a fixed amount or percentage, balance later | Multi-day trips, high-value bookings |
| Pay later | Books now, receives a payment link | Agency, corporate, invoiced clients |
| Manual | Staff records an offline payment | Cash, bank transfer, walk-in |

## How a payment confirms a booking

1. The traveller completes checkout on Stripe.
2. Stripe sends a webhook to Tripistic.
3. Tripistic **verifies the webhook signature** before touching any record.
4. On a verified `payment_intent.succeeded`, the booking moves to `CONFIRMED` and payment status to `PAID`.
5. The confirmation email is queued and the payment event is logged.

Confirmation depends on the verified webhook, never on the browser redirect. A traveller who closes the tab immediately after paying still gets a confirmed booking and their email.

### Why a payment might not confirm

| Symptom | Cause | Fix |
| --- | --- | --- |
| Paid in Stripe, pending in Tripistic | Webhook not delivered or endpoint unreachable | Check the Stripe dashboard webhook log and resend the event |
| Signature verification failed | Wrong webhook secret for the environment | Re-copy the signing secret into Settings → Payments |
| Booking expired before payment landed | Expiry window shorter than the traveller took | Lengthen the window; recreate the booking |

## Payment links

Send a payment link from any unpaid booking. The link is tied to the booking, respects the outstanding balance, and confirms the booking automatically once paid. Links can be resent, and travellers can retry a failed payment from their confirmation page without contacting you.

## Pending expiry

Unpaid `PENDING` bookings hold seats. A scheduled sweep releases those seats when the expiry window elapses, cancels the booking, and records the reason. This is what stops abandoned checkouts from silently blocking your inventory.

Set the window to match your selling pattern: 30–60 minutes for high-demand day tours, 24–72 hours for multi-day trips awaiting a bank transfer.

## Refunds

1. Issue the refund in Stripe — full or partial.
2. Record it against the booking in Tripistic, or let the `charge.refunded` webhook update it.
3. Booking payment status moves to `REFUNDED` or `PARTIALLY_REFUNDED`.
4. Decide separately whether to cancel the booking; refunding does not automatically release seats, because partial refunds and goodwill gestures often accompany a trip that still runs.

Your cancellation terms govern traveller refunds. See the [Refund Policy](/legal/refund-policy) for Tripistic subscription refunds, which are a separate matter.

## Chargebacks

Stripe notifies you of disputes directly. Tripistic retains the booking record, participant details, waiver signatures, check-in records, and the full payment event log — the evidence you need to respond.

## Multi-currency

The workspace currency sets the default. Stripe handles presentation currency and conversion where enabled on your account. Historical bookings keep the currency they were created in, so reports stay accurate after a currency change.

## Reconciliation

Every booking stores its payment intent reference, amount, currency, status, and a complete event log. To reconcile:

1. Filter bookings by date range and payment status.
2. Export the result.
3. Match payment intent references against your Stripe payouts.

Revenue reporting distinguishes gross bookings, refunds, and net revenue, and separates confirmed revenue from pending.

## Security

Tripistic never receives or stores full card numbers — card data goes directly from the traveller's browser to Stripe. This keeps your PCI scope at SAQ-A. See the [Security Policy](/legal/security-policy).

## Related

- [Bookings](/docs/bookings) · [Integrations](/docs/integrations) · [API](/docs/api) · [Troubleshooting](/help)
