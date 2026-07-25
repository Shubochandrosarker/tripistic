---
title: How do I create my first tour?
description: Step-by-step instructions for adding a tour, setting a schedule, and making it bookable.
category: Getting Started
tags: [tours, setup, availability]
order: 1
publishedAt: 2026-07-01
---

## Steps

1. Go to **Tours → New tour**.
2. Enter the name, description, and duration.
3. Set the base price and per-departure capacity.
4. Add the meeting point — it appears on confirmations and the trip timeline.
5. Toggle **Public booking** on if you want it to appear on your booking page.
6. Save.

## Make it bookable

A saved tour is not yet bookable. Travellers buy **availability**, not tours.

1. Open the tour and go to **Schedules**.
2. Add a schedule: days of the week, departure times, and season start and end.
3. Go to **Operations** and generate availability for a date range — 90 days is a good starting point.

Each generated record is a real departure with its own capacity and seat count.

## Optional but recommended

- **Add-ons** — equipment, pickup, meals. Priced per participant or per booking.
- **Blackout dates** — closures and holidays that should suppress availability.
- **Booking cutoff** — how long before departure online sales close.

## Verify it worked

Open your booking page at `/book/your-workspace-slug` in a private browser window. The tour should appear with selectable dates. If it does not, check:

| Symptom | Cause |
| --- | --- |
| Tour missing entirely | Public booking is off |
| Tour visible, no dates | No availability generated |
| Some dates missing | Blackout date or season boundary |
| Dates greyed out | Sold out, or past the booking cutoff |

## Related

- [Getting Started](/docs/getting-started) · [Tours & Operations](/docs/tours)
