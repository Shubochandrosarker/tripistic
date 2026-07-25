---
title: How do I connect Stripe and take payments?
description: Connect your Stripe account, configure payment modes, verify the webhook, and go live safely.
category: Getting Started
tags: [stripe, payments, setup]
order: 3
publishedAt: 2026-07-01
---

Money moves directly into your own Stripe account. Tripistic never holds your funds.

## Connect

1. Go to **Settings → Payments**.
2. Choose **Connect Stripe** and authorise the connection.
3. Confirm the currency matches your workspace currency.
4. Copy the webhook signing secret from Stripe into the field shown.

## Choose a payment mode

| Mode | Traveller pays | Best for |
| --- | --- | --- |
| Full payment | The total at checkout | Day tours |
| Deposit | A fixed amount or percentage now, balance later | Multi-day, high value |
| Pay later | Nothing now; receives a payment link | Agency and corporate clients |
| Manual | Offline; staff records it | Cash, bank transfer, walk-in |

## Set the expiry window

Unpaid bookings hold seats until this window elapses, then release them automatically.

- **Day tours:** 30–60 minutes.
- **Multi-day trips:** 24–72 hours, if travellers pay by transfer.

Too long and abandoned checkouts block your inventory. Too short and legitimate travellers lose their seats.

## Test before going live

**Do this in Stripe test mode first.**

1. Switch Stripe to test mode and use the test signing secret.
2. Make a booking on your public page with a test card.
3. Confirm the booking moves to `CONFIRMED` and the confirmation email arrives.
4. Test a **declining** card and confirm the retry flow works.
5. Switch to live mode and replace the signing secret with the live one.

Step 5 is the most commonly missed. Test and live signing secrets are different — carrying the test secret into live mode means no booking will ever confirm.

## Verify it is working

**Settings → Payments** shows connection status and recent webhook activity. Green with recent events means you are fine.

## Related

- [Payments](/docs/payments) · [Payment not showing](/help/payment-not-showing)
