---
title: The peak season operations checklist
description: What to fix in the six weeks before peak season, from capacity and staffing to payment windows and incident readiness.
category: Operations
tags: [operations, peak season, staffing, capacity]
author: Tripistic Team
authorRole: Operations
publishedAt: 2026-06-22
---

Peak season does not break operations. It reveals what was already broken at lower volume. Here is the six-week checklist that prevents the predictable failures.

## Six weeks out: capacity and catalog

- **Generate availability through the end of the season.** Running out of bookable dates mid-July is the most common and most avoidable revenue loss.
- **Audit capacity per departure.** The number that was right in April may not match the vehicle you will actually have in August.
- **Set blackout dates.** Local holidays, maintenance days, and private buyouts, entered now rather than discovered as a double-booking.
- **Review pricing.** Peak pricing, group rates, and returning-guest rates decided before demand arrives, not during.
- **Check add-on capacity.** Equipment and hotel pickup have their own limits. Selling twenty pickups when the van seats eight is a peak-season classic.

## Five weeks out: staffing

- **Confirm guide availability for the whole season.** Not "probably around" — actual dates in the system.
- **Check certification expiry.** First aid, licences, permits. An expiry mid-season removes a guide from the roster on a day you cannot afford it.
- **Enter approved time off.** Time off that only exists in someone's memory becomes a conflict in week three.
- **Confirm driver assignments separately from guides.** They are different constraints; treating them as one puts the same person in two places.
- **Identify your backup for each role.** Who covers a guide who calls in sick at 06:00 on a Saturday? Decide now.

## Four weeks out: fleet and vendors

- **Vehicle inspections and insurance dates checked.** An expired inspection grounds a vehicle regardless of what is booked on it.
- **Maintenance scheduled outside peak.** Do it in the quiet week, not the busy one.
- **Vendor rates confirmed in writing.** A verbal rate from March will be disputed in August.
- **Backup vendors identified** for the suppliers you cannot operate without.

## Three weeks out: payments and policy

- **Review the pending-payment expiry window.** Too long and abandoned checkouts hold peak inventory. Too short and legitimate travellers lose seats. Day tours: 30–60 minutes. Multi-day: 24–72 hours.
- **Test the full payment flow end to end**, including a failed card and a retry.
- **Confirm the Stripe webhook is delivering.** Check the log. A webhook that silently stopped after an environment change confirms nothing.
- **Publish your cancellation policy clearly** on the booking page, before payment.
- **Decide your peak-season refund posture** and brief the team, so decisions are consistent.

## Two weeks out: communication

- **Test every automated message.** Confirmation, reminder, delay notice, payment reminder, review request. Send each to yourself and read it on a phone.
- **Check reminder lead times per tour type.** A 48-hour reminder is right for a day tour and too late for a trip requiring travel.
- **Verify time zone handling** for travellers booking from other regions.
- **Prepare templates for the bad days** — weather cancellation, vehicle failure, guide illness. Writing these calmly in June beats writing them at 07:00 in August.

## One week out: readiness

- **Run the nightly staffing audit.** Every departure with bookings should have a guide, a driver where needed, and a vehicle where needed.
- **Brief every guide on incident reporting.** What to record, when, and to whom.
- **Confirm emergency contacts** are captured for every participant.
- **Check waiver completion rates.** Chase the gaps now, not at the meeting point.
- **Download offline manifests** for areas with poor connectivity.

## During: the daily rhythm

Three checks, ten minutes total:

**Morning** — today's departures: staffing complete, waivers signed, payments settled, capacity accurate.

**Midday** — operational status: anything delayed, any incident, anything needing a traveller notification.

**Evening** — tomorrow: the same morning check, run a day early, while there is still time to fix it.

## After: the review that makes next season easier

Within two weeks of the season ending, while it is still fresh:

| Metric | Question it answers |
| --- | --- |
| Load factor by tour and weekday | What consistently ran under capacity? |
| Cancellations by reason | Which were preventable? |
| Incidents by severity and type | What is the recurring pattern? |
| No-show rate | Did the reminders work? |
| Guide ratings and repeat rate | Who drives repeat business? |
| Revenue by channel, net of commission | Where is margin actually coming from? |

Write down three things to change before next season. Operators who do this compound; operators who go straight into recovery mode repeat the same season indefinitely.

---

**Related:** [Operations](/features/operations) · [Guides](/features/guides) · [Vehicles](/features/vehicles)
