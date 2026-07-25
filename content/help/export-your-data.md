---
title: How do I export my data?
description: Export bookings, customers, and financial records for accounting, reporting, migration, or a data subject request.
category: Account & Billing
tags: [export, data, gdpr, accounting]
order: 9
publishedAt: 2026-07-01
---

Your data is yours, and it is exportable at any time.

## From the interface

Most list views have an **Export** action that respects the filters currently applied. Filter first, export second — it is far easier than exporting everything and cutting it down afterwards.

| Export | Contains |
| --- | --- |
| Bookings | Status, payment status, amounts, participants, departure, payment reference |
| Customers | Contact details, tags, consent state, booking count, lifetime value |
| Availability | Departures, capacity, seats sold, assigned staff and vehicle |
| Payments | Amounts, currency, status, refunds, Stripe payment intent references |
| Incidents | Date, severity, description, actions, follow-up |

## Via the API

For scheduled or large exports, paginate the API. See the [export example](/developers/examples) for a working script.

## For accounting

Filter bookings by date range and `paymentStatus=PAID`, then export. Reconcile using the **payment intent reference** against your Stripe payouts — matching on amount alone produces false matches whenever two bookings cost the same.

## For a data subject request

If a traveller asks for a copy of their data, or asks you to delete it:

1. Find the customer record.
2. Export their record, bookings, and timeline.
3. For deletion, use record-level deletion — but check your legal retention obligations first. Invoices and tax records usually must be retained regardless of a deletion request.

You are the controller for traveller data in your workspace; Tripistic is the processor. See the [DPA](/legal/data-processing-agreement) and [GDPR](/legal/gdpr).

## If you cancel your subscription

Your data remains exportable for **30 days** after cancellation, then is deleted in line with our retention schedule. Export before that window closes.

## Related

- [Privacy Policy](/legal/privacy-policy) · [API](/docs/api) · [Examples](/developers/examples)
