---
title: Cookie Policy
description: Every cookie category Tripistic uses, the vendors involved, how consent is captured, and how to change your choice at any time.
eyebrow: Privacy & Data
category: Privacy & Data
order: 3
publishedAt: 2026-07-01
updatedAt: 2026-07-01
---

> **Template notice.** Confirm the vendor list below matches what your production deployment actually loads before publishing.

This Cookie Policy explains how Tripistic uses cookies and similar technologies — local storage, session storage, pixels, and SDKs — on the marketing website, the authenticated application, the customer portal, and public booking pages.

## What cookies are

Cookies are small text files a site stores on your device. They let a site remember your session, your preferences, and how you arrived. Similar technologies such as local storage and tracking pixels serve comparable purposes and are covered by this policy.

## Cookie categories

### Strictly necessary

Required for the Service to work. These load without consent because the Service cannot function without them.

| Cookie | Purpose | Duration |
| --- | --- | --- |
| `authjs.session-token` | Authenticated session | Session / 30 days |
| `authjs.csrf-token` | Cross-site request forgery protection | Session |
| `tripistic.workspace` | Active workspace context | 1 year |
| `tripistic.theme` | Light or dark mode preference | 1 year |
| `tripistic.consent` | Records your cookie choices | 12 months |
| Load balancer / CDN cookies | Routing, DDoS protection, rate limiting | Session |

### Functional

Improve the experience but are not essential: remembering a collapsed sidebar, a preferred date range, dismissed onboarding hints, or a saved table view. Declining these means those preferences reset each visit.

### Analytics

Help us understand which pages and features are used, where visitors drop off, and which errors occur. Loaded only after consent.

| Vendor | Purpose | Data |
| --- | --- | --- |
| Google Analytics 4 | Traffic, engagement, conversion measurement | Pseudonymised identifiers, page views, events |
| Google Tag Manager | Tag delivery container | No independent collection |
| Microsoft Clarity | Session replay and heatmaps, with input masking | Interaction events, masked text |
| Google Search Console | Search performance (no cookie; verification only) | Aggregated search data |

### Marketing

Measure advertising performance and let us reach relevant audiences. Loaded only after consent.

| Vendor | Purpose |
| --- | --- |
| Meta Pixel | Conversion measurement and audiences |
| LinkedIn Insight Tag | Conversion measurement and audiences |

## How we ask for consent

On your first visit you see a consent banner with three choices: accept all, reject non-essential, or manage preferences by category. Nothing in the functional, analytics, or marketing categories loads until you make a choice, and rejecting is as easy as accepting.

We honour the **Global Privacy Control** (`Sec-GPC`) signal. If your browser sends it, analytics and marketing categories default to rejected.

## Changing your choice

- Use the **Cookie preferences** link in the site footer at any time.
- Clear cookies in your browser to reset all choices.
- Configure your browser to block cookies entirely — note that blocking strictly necessary cookies will prevent sign-in.

Your choice is stored for 12 months, after which we ask again.

## Analytics in the authenticated application

Inside the application we record product analytics events — feature usage, workflow completion, and error diagnostics — tied to your workspace rather than to advertising identifiers. This supports service improvement under legitimate interests and is not used for advertising.

## Do Not Track

There is no consistent industry standard for Do Not Track, so we do not respond to the DNT header. We do respond to Global Privacy Control as described above.

## Related documents

- [Privacy Policy](/legal/privacy-policy)
- [GDPR Compliance](/legal/gdpr)
- [CCPA / US State Privacy](/legal/ccpa)

## Contact

Questions about cookies: [privacy@tripistic.com](mailto:privacy@tripistic.com).
