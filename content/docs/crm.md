---
title: CRM
description: Customers, leads, companies, tasks, and timeline activity — the relationship layer behind repeat bookings and higher-value trips.
eyebrow: Core workflows
category: Operations
icon: users
order: 3
publishedAt: 2026-07-01
---

Tripistic's CRM is not a bolt-on. Every booking, payment, message, waiver, and trip writes to the same customer record, so the history is complete without anyone maintaining it by hand.

## The four record types

| Record | Represents | Created by |
| --- | --- | --- |
| **Customer** | Someone who has booked or is booking | Any booking, manually, or via API |
| **Lead** | An enquiry that has not converted | Contact forms, manual entry, API |
| **Company** | An agency, corporate client, school, or partner | Manually, or linked from a booking |
| **Task** | Follow-up work owned by a person | Manually, or from automation |

## Customers

A customer record holds contact details, locale and language, marketing consent, tags, internal notes, and a full activity timeline.

The timeline aggregates automatically:

- Bookings created, modified, cancelled, completed.
- Payments, refunds, and failed attempts.
- Emails sent and delivery outcomes.
- Waivers signed and documents attached.
- Portal logins and message threads.
- Notes and tasks added by staff.

Because the timeline is derived from real events, it is accurate without anyone logging activity manually.

### Merging duplicates

Duplicates happen — the same traveller books with a personal email one year and a work email the next. Open the customer, choose **Merge**, and pick the surviving record. Bookings, payments, documents, and timeline entries move across; the merged record retains both email addresses.

## Leads

Leads track demand that has not converted yet, with a source, an owner, a status, an estimated value, and a next action.

| Status | Meaning |
| --- | --- |
| `NEW` | Captured, not yet worked |
| `CONTACTED` | First outreach done |
| `QUALIFIED` | Fit and intent confirmed |
| `PROPOSAL` | Itinerary or quote sent |
| `WON` | Converted to a booking |
| `LOST` | Closed with a reason |

Converting a lead creates the customer record and carries the history across, so nothing is retyped. Lost reasons feed your pipeline reporting — price, dates, capacity, no response, or competitor.

## Companies

Companies group the people who book on behalf of an organisation: travel agencies, corporate clients, schools, and DMC partners. A company record holds billing details, commission or net-rate terms, the contacts inside it, and every booking made under it.

Use companies when you need to answer "how much revenue came from this agency this season" without reconstructing it from individual bookings.

## Tasks

Tasks are the follow-up layer: call a lead back, chase a waiver, confirm a supplier, collect a balance. Each has an owner, due date, priority, and optional link to a customer, lead, company, or booking. Overdue tasks surface on the dashboard.

## Activity and notes

Staff notes are timestamped and attributed. Use them for context the system cannot infer — a service recovery, an accessibility requirement, a VIP relationship, a payment arrangement.

## Segmentation

Filter customers by tag, booking count, total spend, last trip date, tour booked, source, or company. Common segments:

- **Repeat travellers** — more than one completed booking, for loyalty offers.
- **Lapsed** — no booking in 12 months, for reactivation.
- **High value** — top spend decile, for premium or private trips.
- **Never reviewed** — completed trip, no review submitted.

## Marketing consent

Consent is stored per customer with the timestamp and source of capture. Marketing sends respect it automatically; transactional messages tied to a real booking are always delivered. Unsubscribes are honoured immediately and permanently. See the [Acceptable Use Policy](/legal/acceptable-use-policy).

## AI in the CRM

AI business insights read CRM signals to surface repeat-booking opportunities, at-risk relationships, lead sources worth more investment, and segments worth a targeted offer. Suggestions are advisory — review before acting.

## Related

- [Bookings](/docs/bookings) · [Users](/docs/users) · [Integrations](/docs/integrations) · [API](/docs/api)
