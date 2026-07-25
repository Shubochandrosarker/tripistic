---
title: How do I cancel, refund, or move a booking?
description: Cancel a booking, record a refund, or move travellers to a different departure without breaking seat accounting.
category: Bookings & Payments
tags: [bookings, cancellation, refunds]
order: 5
publishedAt: 2026-07-01
---

## Cancel a booking

1. Open the booking and choose **Cancel**.
2. Select a reason — this feeds your cancellation reporting.
3. Choose whether to notify the traveller.
4. Confirm.

Seats are released immediately and become available to other travellers.

## Refund a traveller

Cancelling does **not** issue a refund. The two are deliberately separate, because plenty of cancellations do not warrant one and some refunds happen without a cancellation.

1. Issue the refund in your Stripe dashboard — full or partial.
2. Tripistic records it automatically from the `charge.refunded` webhook, or you can record it manually against the booking.
3. Payment status becomes `REFUNDED` or `PARTIALLY_REFUNDED`.

Your own cancellation terms govern what a traveller is owed.

## Move a booking to a different departure

1. Open the booking and choose **Change departure**.
2. Pick the new availability.
3. Confirm.

Seats are released on the old departure and reserved on the new one in a single operation. If the new departure does not have enough capacity, the move is rejected rather than overbooking it.

## Cancel a whole departure

Cancel the availability record rather than each booking individually. Every booking on it is released and you are prompted to notify affected travellers. Refunds remain your decision.

## What gets recorded

Every change writes to the booking's event timeline with the actor and timestamp. You can always see who changed what and when.

## Common questions

**Can I cancel a booking that is already completed?** No. Use `NO_SHOW` for travellers who did not arrive, which keeps the historical record accurate.

**Will the traveller be notified automatically?** Only if you choose to notify. Cancellation notices are never sent silently.

**Can I restore a cancelled booking?** Not directly — create a new booking. The cancelled record stays for audit purposes.

## Related

- [Bookings](/docs/bookings) · [Payments](/docs/payments) · [Refund Policy](/legal/refund-policy)
