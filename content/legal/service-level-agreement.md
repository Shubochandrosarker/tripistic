---
title: Service Level Agreement
description: Availability commitments, support response times, service credits, and maintenance windows for Tripistic paid and enterprise plans.
eyebrow: Enterprise
category: Security & Compliance
order: 9
publishedAt: 2026-07-01
updatedAt: 2026-07-01
---

> **Status: not in force.** Tripistic does not currently operate the external
> monitoring or public status page that an availability commitment has to be
> measured against, so no uptime percentage or service credit on this page is
> offered or enforceable today.
>
> This document is retained as the intended structure of a future SLA. It takes
> effect only once monitoring, a status page, and an incident process are live
> and this notice is removed. Nothing here creates a present contractual
> commitment.
>
> **Template notice.** Align the targets below with what your infrastructure and support rota can actually sustain before publishing.

This Service Level Agreement ("SLA") applies to paid Tripistic subscriptions and forms part of the [Terms of Service](/legal/terms-of-service). It does not apply to free trials, sandbox workspaces, or beta features.

## Availability commitment

| Plan | Monthly uptime target |
| --- | --- |
| Solo | 99.5% |
| Operator | 99.9% |
| Agency | 99.9% |
| Enterprise | 99.95% (or as stated in the order form) |

**Covered services (once in force):** the authenticated application, public booking pages, the customer portal, and embeddable booking widgets. The REST API is not yet available and is therefore not covered.

### How uptime is measured

Monthly Uptime Percentage = `((Total Minutes − Unavailable Minutes) ÷ Total Minutes) × 100`, measured per calendar month from external monitoring. **This measurement is not currently performed** — see the status notice at the top of this page. The method is stated here so it is fixed in advance of the commitment taking effect.

"Unavailable" means core booking, authentication, or API endpoints return server errors or fail to respond for two or more consecutive checks.

### Exclusions

Unavailability does not include time attributable to:

- Scheduled maintenance announced in advance, or emergency maintenance required for security.
- Factors outside our reasonable control, including internet backbone failures and force majeure events.
- Failures of third-party services you have connected — Stripe, Google Maps, Twilio, WhatsApp, AI providers, Zapier, n8n — or of your own DNS and custom domain configuration.
- Your use in breach of the Terms of Service or [Acceptable Use Policy](/legal/acceptable-use-policy), or traffic exceeding published rate limits.
- Suspension for non-payment.
- Beta, preview, or feature-flagged functionality.

## Support

| Plan | Channels | First response (business hours) | Business hours |
| --- | --- | --- | --- |
| Solo | Email, help centre | 1 business day | Mon–Fri, 09:00–18:00 UTC |
| Operator | Email, in-app | 8 business hours | Mon–Fri, 09:00–18:00 UTC |
| Agency | Email, in-app, priority queue | 4 business hours | Mon–Fri, 08:00–20:00 UTC |
| Enterprise | Email, in-app, named contact, escalation phone | 1 hour for P1 | 24×7 for P1 |

### Severity definitions and response targets

| Severity | Definition | First response | Update cadence |
| --- | --- | --- | --- |
| P1 — Critical | Bookings, payments, or sign-in unavailable for all users; data loss risk | 1 hour (Enterprise) / 4 business hours | Hourly |
| P2 — High | Major feature broken with no workaround; degraded performance affecting operations | 4 business hours | Daily |
| P3 — Normal | Feature issue with a workaround; incorrect behaviour without operational impact | 1 business day | Every 3 business days |
| P4 — Low | Cosmetic issue, documentation gap, feature request | 2 business days | As progressed |

First response means a human acknowledgement with an assessment, not an automated receipt.

## Service credits

If we miss the monthly uptime target for your plan, you may request a credit against the next invoice.

| Monthly uptime achieved | Credit (% of monthly fee) |
| --- | --- |
| Below target but ≥ 99.0% | 10% |
| ≥ 95.0% but < 99.0% | 25% |
| ≥ 90.0% but < 95.0% | 50% |
| < 90.0% | 100% |

### Claiming a credit

Submit a claim to [support@tripistic.com](mailto:support@tripistic.com) within 30 days of the end of the affected month, including the dates and times of unavailability and any logs or error responses you observed. We respond within 15 business days.

Credits are applied to future invoices, are not refunds, are not exchangeable for cash, and are capped at 100% of one month's fee for the affected month. Service credits are your sole remedy for missed availability targets.

## Maintenance

- **Scheduled maintenance:** announced at least 72 hours in advance, targeted at low-traffic windows (typically Sunday 02:00–05:00 UTC). We aim for zero-downtime deploys; where downtime is unavoidable we publish the expected duration.
- **Emergency maintenance:** performed as needed to address a security or stability risk, with notice as soon as practical.
- **Deprecations:** API and feature deprecations carry at least 90 days' notice for paid plans, published in the [Changelog](/changelog).

## Status and incident communication

We publish incident status and post-incident reviews. For P1 incidents, enterprise customers receive direct notification to their named contact, hourly updates while unresolved, and a written post-incident review within 5 business days covering timeline, root cause, impact, and preventive actions.

## Data durability

Backup, retention, and recovery objectives — including a 15-minute RPO and 4-hour RTO — are documented in the [Security Policy](/legal/security-policy).

## Changes

We may update this SLA. Changes that reduce a commitment take effect at your next renewal, not mid-term.

## Contact

[support@tripistic.com](mailto:support@tripistic.com) for support and credit claims. [sales@tripistic.com](mailto:sales@tripistic.com) for a negotiated enterprise SLA.
