---
title: How do I assign guides, drivers, and vehicles?
description: Assign staff and fleet to departures, resolve conflicts, and find unstaffed departures before they become a problem.
category: Operations
tags: [guides, drivers, vehicles, dispatch]
order: 7
publishedAt: 2026-07-01
---

## Assign from a departure

1. Open the departure from **Operations** or the tour's operations tab.
2. Choose **Assign guide**, **Assign driver**, or **Assign vehicle**.
3. Tripistic shows who and what is qualified and free for that time.
4. Select and save.

Guides, drivers, and vehicles are assigned independently, so a multi-vehicle day or a separate driver is straightforward.

## Assign from dispatch

For bulk work, **Operations → Dispatch** shows every departure on a chosen day with unassigned slots highlighted. This is the fastest way to fill tomorrow's gaps.

## Why is someone not in the list?

| Reason | Fix |
| --- | --- |
| Already assigned at that time | Choose someone else or move the other assignment |
| Approved time off | Check their time-off records |
| Missing a required skill or language | Update their profile if the qualification is current |
| Expired certification | Renew and update the expiry date |
| Not marked available for that period | Update their availability |

## Conflicts

Assigning someone already committed at the same time raises a conflict warning before you save. You can override where you genuinely intend it — back-to-back departures at the same meeting point, for example — but you will not do it by accident.

Vehicles are checked for capacity against the participant count and for expired inspection or insurance dates.

## Find unstaffed departures

Filter the operations view by **Unassigned** to see every departure with bookings but no guide, driver, or vehicle.

Do this the evening before, not the morning of. Automating it as a nightly check is even better — see the [nightly audit example](/developers/examples).

## Guides on their phones

Guides with the Guide role see only their own assigned departures, with the manifest, waiver status, payment status, and per-participant notes. They can check participants in and report incidents from the field.

## Related

- [Tours & Operations](/docs/tours) · [Permissions](/docs/permissions)
