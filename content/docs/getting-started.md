---
title: Getting Started
description: Create your workspace, publish your first tour, take a real booking, and get your team into Tripistic in under an hour.
eyebrow: Setup
category: Foundations
icon: rocket
order: 1
publishedAt: 2026-07-01
---

This guide takes a brand-new workspace to a live, bookable tour with payments enabled. Budget about 45 minutes.

## Before you start

Have these ready:

- A business email address for the workspace owner account.
- Your Stripe account credentials (or the ability to create one).
- One tour you want to sell first: name, duration, price, capacity, and meeting point.
- Your logo as an SVG or PNG, if you want branding applied immediately.

## 1. Create your workspace

1. Go to [Create account](/register) and register with your business email.
2. Enter your business name. This generates your workspace slug — the address your public booking page lives at, for example `tripistic.com/book/coastal-tours`.
3. Set your time zone and currency. **Get these right now** — availability windows, departure times, cutoffs, and reports all derive from the workspace time zone.
4. Complete the onboarding checklist that appears on your dashboard.

> Changing currency after you have taken bookings is not recommended. Historical bookings retain the currency they were created with.

## 2. Build your first tour

Go to **Tours → New tour**.

| Field | What it controls |
| --- | --- |
| Name and description | What travellers see on the public booking page |
| Duration | Manifest planning and calendar blocks |
| Base price | Default price per participant |
| Capacity | Maximum seats per departure |
| Meeting point | Shown on confirmations and the trip timeline |
| Public booking | Whether the tour appears on your booking page |

Save the tour, then add:

- **Schedules** — recurring departure times, days of the week, and season boundaries.
- **Add-ons** — equipment rental, hotel pickup, meal upgrades, priced per participant or per booking.
- **Blackout dates** — maintenance days, holidays, and closures that suppress availability.

## 3. Generate availability

Availability records are the bookable slots travellers actually buy. From the tour's **Operations** tab, generate availability from your schedule for a date range — typically the next 90 days.

Each availability record tracks its own capacity, seats remaining, assigned guide, assigned driver, assigned vehicle, and operational status. Seats are reserved atomically, so two travellers cannot book the same last seat.

## 4. Connect payments

Go to **Settings → Payments** and connect Stripe.

1. Authorise the Stripe connection.
2. Choose your payment mode: full payment at booking, deposit, or pay later with a payment link.
3. Set the pending-payment expiry window. Unpaid bookings release their seats automatically when it elapses.

Take a test booking in Stripe test mode before you go live. See [Payments](/docs/payments) for the full flow.

## 5. Publish your booking page

Go to **Settings → Public booking**.

- Confirm your workspace slug and page title.
- Choose which tours appear.
- Add your logo and brand colour.
- Copy the embeddable widget snippet if you want the booking flow on your existing website.

Your page is live at `/book/your-slug`. Open it in a private window and complete a real end-to-end booking to see what travellers experience.

## 6. Invite your team

Go to **Settings → Members** and invite people by email with the role that fits:

| Role | Can do |
| --- | --- |
| Owner | Everything, including billing and workspace deletion |
| Admin | Everything except billing and deletion |
| Operations | Bookings, tours, availability, dispatch, CRM |
| Guide | Assigned departures, manifests, check-ins |
| Read-only | View reports and records without editing |

Invitations expire after 7 days and can be resent. See [Users](/docs/users) and [Permissions](/docs/permissions).

## 7. Turn on automation

Go to **Settings → Notifications** and enable the workflows you want:

- Booking confirmation emails.
- Pre-departure reminders (choose the lead time).
- Post-trip review requests.
- Delayed-departure notices.
- Payment reminders for unpaid bookings.

## What to do next

- [Bookings](/docs/bookings) — take manual bookings, manage participants, handle changes.
- [CRM](/docs/crm) — build the customer and lead records behind repeat business.
- [Integrations](/docs/integrations) — connect maps, calendars, messaging, and AI providers.
- [API](/docs/api) — automate against the REST API.

Stuck? Search the [Help Center](/help) or [contact support](/contact).
