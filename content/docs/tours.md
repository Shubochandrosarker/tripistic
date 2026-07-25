---
title: Tours & Operations
description: Building your tour catalog, generating availability, assigning guides, drivers, and vehicles, and running the live operations centre on trip day.
eyebrow: Core workflows
category: Operations
icon: map
order: 4
publishedAt: 2026-07-01
---

Tours define what you sell. Availability defines when it can be bought. Operations is what happens on the day.

## The tour catalog

A tour holds its name, description, media, duration, base price, capacity, meeting point, difficulty, languages, inclusions and exclusions, and its public booking settings.

### Schedules

Schedules generate departures without manual entry: pick the days of the week, departure times, season start and end, and capacity per departure. One tour can carry several schedules — a summer daily schedule and a winter weekend-only schedule, for example.

### Add-ons

Add-ons are sold alongside the tour — equipment rental, hotel pickup, meals, photo packages, insurance. Each is priced per participant or per booking, and can have its own capacity limit where supply is constrained.

### Blackout dates

Blackout dates suppress availability for closures, holidays, maintenance, and private buyouts. They apply per tour or across the workspace.

## Availability

Availability records are the bookable slots. Generate them from a schedule for a date range, or create one-off departures manually.

Each record tracks:

| Field | Purpose |
| --- | --- |
| Date and start time | When the departure runs, in workspace time zone |
| Capacity and seats remaining | Atomic seat accounting |
| Assigned guide | Who is leading |
| Assigned driver | Who is driving, where transport applies |
| Assigned vehicle | Which vehicle is allocated |
| Operational status | Scheduled, boarding, departed, delayed, completed, cancelled |
| Booking cutoff | When online sales close |

Cancelling an availability releases every booking on it and prompts you to notify affected travellers.

## Workforce

### Guides

Guide profiles carry skills, languages, certifications with expiry dates, availability, ratings, and time-off. When assigning a guide, Tripistic surfaces who is qualified and free — it does not silently double-book anyone.

### Drivers

Drivers are scheduled separately from guides so pickups, transfers, and multi-vehicle days can be coordinated independently. A driver has licence details with expiry tracking and their own availability.

### Time off and conflicts

Approved time-off removes staff from assignment suggestions. Assigning someone who is already on another departure at the same time raises a conflict warning before you commit.

## Vehicles

Vehicle records hold capacity, registration, insurance and inspection expiry, maintenance history, and fuel logs. Assign a vehicle to a departure and Tripistic checks that its capacity covers the participant count and that no compliance date has expired.

## The operations centre

On trip day, the operations centre is the single screen for everything moving.

### Statuses

`SCHEDULED` → `BOARDING` → `DEPARTED` → `COMPLETED`, with `DELAYED` and `CANCELLED` available at any point.

Setting a departure to `DELAYED` prompts you to record the reason and duration, and offers to notify booked travellers automatically.

### Check-in

Guides check participants in from the manifest on a phone. Check-in shows waiver status, payment status, dietary and accessibility notes, and add-ons per participant, so problems surface at the meeting point rather than on the road.

### Incidents

Record what happened, when, who was involved, severity, actions taken, and follow-up owner. Incident records are permanent, attach to the departure and the customers involved, and feed safety reporting. For adventure and educational operators this is the audit trail that matters.

### Operational events

Route changes, weather holds, vehicle swaps, guide substitutions, and notes all write to the departure's event timeline with actor and timestamp.

## Dispatch

The dispatch view shows every departure for a chosen day across tours, with unassigned staff and vehicles highlighted. It is the fastest way to find the gap in tomorrow's schedule before it becomes today's problem.

## Reporting

Operational reporting covers departures run, load factor, cancellations by reason, delays, incidents by severity, guide performance and ratings, and vehicle utilisation.

## Related

- [Bookings](/docs/bookings) · [Users](/docs/users) · [Permissions](/docs/permissions) · [Integrations](/docs/integrations)
