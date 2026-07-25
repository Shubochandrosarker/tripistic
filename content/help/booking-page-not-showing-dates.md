---
title: My booking page shows no available dates
description: The six reasons a tour appears with no bookable dates, and how to fix each.
category: Troubleshooting
tags: [availability, booking page, troubleshooting]
order: 6
publishedAt: 2026-07-01
---

Travellers book **availability**, not tours. A tour with no availability generated shows no dates.

Work through these in order.

## 1. Has availability been generated?

Most common cause by far. Go to the tour → **Operations** and check for departure records in the date range.

**Fix:** generate availability from your schedule for the next 90 days.

## 2. Has the season ended?

Schedules have a season start and end. Once past the end date, no further departures generate.

**Fix:** extend the season end date, then regenerate.

## 3. Is the tour public?

**Fix:** open the tour and enable **Public booking**.

## 4. Are the dates blacked out?

Blackout dates suppress availability and can be set per tour or workspace-wide.

**Fix:** check **Settings → Blackout dates** and remove any that should not apply.

## 5. Is everything sold out?

A departure at zero seats remaining will not appear as bookable.

**Fix:** increase capacity on the departure if you genuinely have room, or generate more departures.

## 6. Has the booking cutoff passed?

If your cutoff is 24 hours, tomorrow morning's departure stops accepting online bookings tonight.

**Fix:** shorten the cutoff, or take the booking manually in the dashboard.

## Quick diagnostic

| Symptom | Most likely cause |
| --- | --- |
| Tour not listed at all | Public booking off |
| Tour listed, calendar empty | No availability generated |
| Some dates missing | Blackout date or season boundary |
| Dates shown but not selectable | Sold out or past cutoff |
| Only far-future dates | Booking cutoff too long |

## Still stuck?

Open the tour's Operations tab and confirm at least one departure exists with `seatsRemaining > 0`, a start time in the future, and a status of `SCHEDULED`. If one does and the page still shows nothing, [contact support](/contact) with the workspace slug and tour name.

## Related

- [Create your first tour](/help/create-your-first-tour) · [Tours & Operations](/docs/tours)
