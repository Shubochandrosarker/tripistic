---
title: A traveller paid but the booking still shows as pending
description: Diagnose and fix payments that succeeded in Stripe but did not confirm the booking in Tripistic.
category: Troubleshooting
tags: [payments, stripe, webhooks, troubleshooting]
order: 2
publishedAt: 2026-07-01
---

Bookings confirm on the **verified Stripe webhook**, not on the browser redirect. If Stripe shows a successful payment but Tripistic still shows `PENDING`, the webhook did not arrive or was rejected.

## Check in this order

### 1. Was the webhook delivered?

Open your Stripe dashboard → **Developers → Webhooks** → your Tripistic endpoint → **Events**.

| What you see | Meaning |
| --- | --- |
| No event for that payment | The event type is not subscribed |
| Event with a failed delivery | Endpoint unreachable or rejected the request |
| Event delivered `200` | Webhook worked — see step 4 |

### 2. Is the signing secret correct?

A `400` on delivery almost always means the signing secret does not match. This is most common after switching between test and live mode, or after redeploying to a new environment.

**Fix:** copy the signing secret from Stripe and paste it into **Settings → Payments**. Test and live mode have different secrets.

### 3. Are the right events subscribed?

The endpoint needs at minimum `payment_intent.succeeded`, `payment_intent.payment_failed`, and `charge.refunded`.

### 4. Had the booking already expired?

If the traveller took longer than your pending-payment window, the sweep may have already cancelled the booking and released the seats. The payment succeeded but there is no live booking to confirm.

**Fix now:** refund the payment or apply it to a new booking you create manually.
**Fix permanently:** lengthen the expiry window in **Settings → Payments**.

## Resolving the immediate case

Once the cause is fixed, **resend the event** from the Stripe dashboard. The booking confirms and the confirmation email is queued.

If the booking was already released, create it manually and mark it paid, referencing the Stripe payment intent in the booking notes so reconciliation stays clean.

## Preventing it

- Test the full payment flow after any environment change.
- Check the webhook log before peak season rather than during it.
- Set an expiry window that matches how your travellers actually pay.

## Related

- [Payments](/docs/payments) · [Webhooks](/developers/webhooks)
