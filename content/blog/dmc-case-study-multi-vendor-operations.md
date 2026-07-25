---
title: Case study — how a DMC cut coordination time by consolidating operations
description: A composite case study of a 40-departure-per-week destination management company moving from six tools to one operating system.
category: Case Studies
tags: [case study, dmc, operations, vendors]
author: Tripistic Team
authorRole: Customer Success
publishedAt: 2026-06-12
---

> **About this case study.** This is a composite drawn from patterns we see repeatedly across destination management companies, not a single named customer. The numbers are representative of the range operators report, not a guarantee.

## The situation

A destination management company running roughly 40 departures a week across three tour types, with 14 guides, 5 drivers, 4 vehicles, and 22 vendor relationships. Revenue split roughly 60% agency partners, 25% marketplaces, 15% direct.

Their stack: a booking widget, a shared spreadsheet for departures, a second spreadsheet for guide scheduling, a group chat for day-of coordination, an email platform for travellers, and accounting software fed manually.

## The symptoms

They did not come to us saying "our stack is fragmented." They came with four specific complaints:

1. **Two double-bookings of the same guide in one month.** Both discovered the evening before, both resolved by paying a freelancer premium rates.
2. **A four-hour month-end close** reconciling bookings against payouts, every month.
3. **Agency partners asking questions nobody could answer quickly** — "how many pax did we send you last quarter and what did they spend?"
4. **A near-miss incident** where the paper record was incomplete because the guide reported it verbally over the phone.

Each of these is a coordination failure, not a booking-software failure. That is the DMC pattern: the booking part usually works fine.

## What changed

### Departures, staffing, and fleet in one record

The single largest change was making the departure the operational unit — carrying its own capacity, guide, driver, vehicle, status, and participants — instead of three spreadsheets that had to agree.

Assignment conflicts became impossible to create silently: assigning a guide already committed at that time raises a conflict before the save, not the evening before.

**Result:** double-bookings went to zero over the following season.

### Vendors attached to itineraries

Vendor rates, contacts, and costs moved onto the itinerary items that used them. Margin per trip became visible at build time rather than after invoicing.

**Result:** the team caught two vendor rate increases that had been silently absorbed for months.

### Companies as first-class records

Agency partners became company records with their own contacts, net-rate terms, and complete booking history.

**Result:** the quarterly partner question went from a half-day reconstruction to a filter. One partner turned out to be worth substantially less than assumed once cancellations were netted out — which changed how much service effort it received.

### Incidents with structure

Incident reporting moved from phone calls to structured records: what happened, when, who, severity, actions taken, follow-up owner, attached to the departure and the customers involved.

**Result:** a real safety record. For a DMC handling group and educational travel, this is procurement-relevant, not just internal hygiene.

### Reconciliation by reference

Every booking carrying its payment reference and event log turned month-end from a matching exercise into an export.

**Result:** four hours down to about forty minutes.

## The numbers

| Measure | Before | After one season |
| --- | --- | --- |
| Guide double-bookings | ~2 per month | 0 |
| Month-end close | 4 hours | ~40 minutes |
| Partner reporting request | Half a day | Minutes |
| Tools in daily use | 6 | 2 (platform + accounting) |
| Direct booking share | 15% | 24% |
| Staff hours on coordination | ~25/week | ~11/week |

The direct booking shift was a side effect rather than a goal — once the customer record persisted across trips, the post-trip sequence became possible, and repeat bookings followed.

## What was hard

Honesty matters more than a clean narrative:

- **The vendor data was a mess.** Rates lived in email threads and one person's memory. Getting them into structured records took three weeks of unglamorous work, and it was the single biggest cost of the migration.
- **Guides resisted the manifest app for about a month.** What changed their minds was check-in showing waiver and payment status at the meeting point — it made their job easier, so they used it.
- **They ran parallel for a full season.** The spreadsheet stayed alive until the team trusted the departure record. That felt like duplicated effort at the time and was the right call.

## What we would tell a similar operation

1. **Start with departures, not bookings.** For a DMC, bookings usually work already. Coordination is the bleeding wound.
2. **Do the vendor data properly, once.** It is the least interesting and highest-return part of the migration.
3. **Let the customer record accumulate before you decide what marketing to do.** A season of real history makes the segmentation obvious.
4. **Do not migrate mid-season.** Start in the quiet quarter, parallel-run through the next peak.

---

**Related:** [Destination Management Companies](/solutions/destination-management-companies) · [Operations](/features/operations) · [Customer stories](/customers)
