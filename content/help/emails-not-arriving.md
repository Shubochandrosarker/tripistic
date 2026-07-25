---
title: Confirmation emails are not arriving
description: Diagnose missing confirmations, reminders, and payment links — from spam filtering to unconfirmed bookings.
category: Troubleshooting
tags: [email, notifications, troubleshooting, deliverability]
order: 10
publishedAt: 2026-07-01
---

## 1. Did the booking actually confirm?

Confirmation emails fire when a booking reaches `CONFIRMED`. If it is still `PENDING`, no confirmation is sent — the email is not missing, the confirmation has not happened.

See [payment not showing](/help/payment-not-showing) if payment succeeded but the booking did not confirm.

## 2. Is the notification enabled?

Check **Settings → Notifications**. Each workflow — confirmation, reminder, review request, delay notice, payment reminder — is toggled independently.

## 3. Check the email log

The booking's event timeline shows every message queued and its delivery outcome.

| Status | Meaning | Action |
| --- | --- | --- |
| Queued | Waiting to send | Wait a few minutes |
| Sent | Handed to the provider | Check spam, then step 4 |
| Bounced | Address rejected it | Correct the address and resend |
| Suppressed | Recipient unsubscribed or previously bounced | See step 5 |

## 4. Spam and deliverability

Ask the traveller to check spam and promotions folders. If confirmations are landing in spam generally, your sending domain authentication needs attention: SPF, DKIM, and DMARC records for the domain you send from.

Operators using a custom sending domain must publish those records. Without them, mailbox providers treat the mail as unauthenticated and filter it aggressively.

## 5. Suppressed addresses

An address that previously hard-bounced or unsubscribed is suppressed. Marketing messages stay suppressed — that is deliberate and legally required. Transactional messages tied to a real booking can be resent once the address is corrected.

## 6. Typos

More common than every other cause combined, particularly with phone bookings. Correct the address on the customer record and resend from the booking.

## Resending

Open the booking and choose **Resend confirmation**. Payment links and waiver requests can be resent the same way.

## Reminders specifically

Reminders send at the lead time configured per notification, in the **workspace time zone**. If they seem to arrive at odd hours for international travellers, check the workspace time zone setting.

## Related

- [Payments](/docs/payments) · [Bookings](/docs/bookings)
