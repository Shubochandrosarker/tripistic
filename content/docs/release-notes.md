---
title: Release Notes
description: What shipped in each Tripistic release, including breaking changes, deprecations, and migration guidance.
eyebrow: Product
category: Platform
icon: tag
order: 12
publishedAt: 2026-07-01
---

Release notes cover engineering-relevant detail: schema changes, API additions, deprecations, and migration steps. For the customer-facing summary see the [Changelog](/changelog); for what is coming see the [Roadmap](/roadmap).

## Versioning

Tripistic follows semantic versioning for the platform and its API.

| Change | Version bump | Notice |
| --- | --- | --- |
| Breaking API or data-model change | Major | 90 days minimum |
| New capability, backwards compatible | Minor | Announced at release |
| Fix or performance improvement | Patch | Announced at release |

Additive changes — new fields, endpoints, and enum values — ship in minor releases. **Clients must ignore unknown fields** to stay compatible.

## v2.0.0 — Enterprise foundation

**Added**

- Super-admin platform layer: workspace provisioning, plan assignment, revenue overview, system health, and maintenance mode.
- White label: brand kits covering the application, portal, emails, PDFs, and API brand metadata.
- Custom domains with DNS verification, SSL status tracking, and ongoing health monitoring.
- AI provider governance — configure and constrain providers and models per deployment.
- Audit log surfaces for owners and admins.
- Customer portal: bookings, invoices, documents, payments, messaging, and trip timeline.

**Changed**

- Workspace scoping hardened on every data access path and API route.
- Booking confirmation now depends solely on the verified Stripe webhook, not the browser redirect.
- Pending payment expiry moved to a scheduled sweep that releases seats reliably.

**Migration**

- Run `prisma migrate deploy` before starting the new build.
- Re-copy your Stripe webhook signing secret if you rotated environments.
- Review member roles: the Operations role now excludes settings access that previously fell under a broader admin grouping.

## v1.6.0 — Workforce and fleet

**Added** driver records scheduled independently of guides; vehicle capacity, maintenance history, fuel logs, and expiry tracking; assignment conflict detection across guides, drivers, and vehicles.

**Changed** the manifest now surfaces per-participant dietary and accessibility notes.

## v1.5.0 — AI itineraries

**Added** the multi-day itinerary builder with days, items, vendors, costs, versioning, and public share links; AI generation from tour catalog and trip context.

**Deprecated** the single-page proposal export. Removed in v2.0.0; use itinerary share links instead.

## v1.4.0 — Operations centre

**Added** departure statuses, delay recording with automatic traveller notification, incident reports with severity and follow-up, operational event timeline, and phone-based participant check-in.

## v1.3.0 — CRM depth

**Added** leads with pipeline statuses and lost reasons, companies with net-rate terms, CRM tasks with owners and due dates, and the automatic customer activity timeline.

## v1.2.0 — Payments hardening

**Added** payment links, retry from the confirmation page, deposit support, and the payment event log.

**Fixed** a race in seat accounting under concurrent booking. Seat reservation is now atomic; simultaneous requests for a last seat produce exactly one success and one `409`.

## v1.1.0 — Public booking

**Added** public booking pages, the embeddable widget, guest-token confirmations, and digital waivers.

## v1.0.0 — Initial release

Tours, availability, bookings, participants, customers, Stripe checkout, transactional email, and the operator dashboard.

## Deprecation policy

Deprecated capabilities are announced in release notes and the [Changelog](/changelog), remain functional for at least 90 days on paid plans, and emit a deprecation warning header on affected API responses where practical. Enterprise customers with an order form may have longer windows.

## Related

- [Changelog](/changelog) · [Roadmap](/roadmap) · [API](/docs/api) · [SLA](/legal/service-level-agreement)
