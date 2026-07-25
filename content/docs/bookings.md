---
title: Bookings
description: The booking lifecycle in Tripistic — creating, confirming, modifying, cancelling, and reconciling reservations across public and manual channels.
eyebrow: Core workflows
category: Operations
icon: calendar
order: 2
publishedAt: 2026-07-01
---

A booking in Tripistic is the operational record for one reservation: who is travelling, on which departure, what they paid, which documents they signed, and everything that happened to it.

## Booking sources

| Source | Created by | Typical use |
| --- | --- | --- |
| Public booking page | Traveller, at `/book/your-slug` | Direct online sales |
| Embedded widget | Traveller, on your own website | Direct sales without leaving your site |
| Manual booking | Your staff, in the dashboard | Phone, email, walk-in, agency, partner |
| API | Your systems | OTA sync, custom flows, migrations |

Every source produces the same record shape, so reporting and operations never depend on the channel.

## Lifecycle states

| Status | Meaning | Seats held |
| --- | --- | --- |
| `PENDING` | Created, awaiting payment | Yes, until expiry |
| `CONFIRMED` | Payment received or manually confirmed | Yes |
| `CANCELLED` | Cancelled by traveller or staff | No, released |
| `COMPLETED` | Departure finished | Historical |
| `NO_SHOW` | Traveller did not arrive | Historical |

Payment status is tracked separately — `UNPAID`, `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED` — because a booking can be confirmed while payment is still outstanding, and vice versa.

## Creating a manual booking

**Bookings → New booking**:

1. Choose the tour, then the specific availability (departure date and time).
2. Select or create the customer. Existing customers bring their history, notes, and preferences.
3. Set participant count and add each participant's details.
4. Add any add-ons.
5. Adjust pricing if you are honouring a quoted rate or applying a partner discount.
6. Choose payment handling: mark as paid, send a payment link, or leave unpaid.

Seats are reserved the moment you save. If capacity is exhausted, the save fails rather than overbooking.

## Participants

Each participant carries their own name, age band, dietary notes, accessibility needs, emergency contact, and waiver status. Participants matter operationally because:

- Manifests are built from participants, not booking counts.
- Waivers are signed per participant.
- Check-in is per participant.
- Capacity is consumed per participant.

## Payments

- **Full payment:** traveller pays at checkout via Stripe; seats confirm on the verified webhook.
- **Deposit:** partial payment at booking, balance collected later via payment link.
- **Pay later:** booking created unpaid with a payment link sent by email.
- **Retry:** failed payments can be retried by the traveller from their confirmation link.
- **Expiry:** unpaid pending bookings release seats automatically when the expiry window elapses.

Bookings confirm on the **verified Stripe webhook**, never on a browser redirect — a traveller who closes the tab mid-payment still gets a confirmed booking.

## Modifying a booking

From the booking detail page you can change the departure, add or remove participants, add add-ons, adjust price, update payment status, and edit notes. Every change writes to the booking's event timeline with the actor and timestamp, so you always know who changed what.

**Moving a booking to a different departure** releases seats on the old availability and reserves them on the new one atomically. If the new departure is full, the move is rejected.

## Cancelling and refunding

1. Open the booking and choose **Cancel**.
2. Select a reason — it feeds your cancellation reporting.
3. Choose whether to notify the traveller.
4. Issue a refund in Stripe if your terms require one, then record it against the booking.

Seats are released immediately on cancellation. Refunds to travellers are governed by **your** cancellation terms, not Tripistic's — see the [Refund Policy](/legal/refund-policy).

## Waivers and documents

Travellers sign digital waivers from their confirmation link or the customer portal. Waiver status appears on the manifest so guides can see at a glance who still needs to sign. Attach vouchers, permits, and trip documents to the booking; they surface in the traveller's portal automatically.

## Manifests and day-of operations

The daily manifest lists every departure with participants, contact details, waiver status, payment status, dietary and accessibility notes, add-ons, and assigned staff. Guides check participants in from the manifest. See [Operations](/docs/tours) and the live operations centre for delays, incidents, and route changes.

## Reconciliation

Each booking carries its Stripe payment intent reference and a full payment event log. To reconcile a period, filter bookings by date and payment status, then export. Amounts, currency, refunds, and webhook events are all retained for audit.

## Common questions

**Can I overbook deliberately?** Increase the availability's capacity for that departure rather than bypassing capacity checks.

**Can two staff edit the same booking at once?** Yes, but seat-affecting operations are serialised — the second write fails cleanly instead of corrupting capacity.

**How do I handle a group that pays separately?** Create one booking per payer, or one booking with a payment link per participant. Group manifests read from participants either way.

## Related

- [Payments](/docs/payments) · [CRM](/docs/crm) · [Tours](/docs/tours) · [API](/docs/api)
