---
title: Integrations
description: Connecting Stripe, Google Maps, Google Calendar, Twilio, WhatsApp, OpenAI, OpenRouter, Cloudflare, n8n, Zapier, and webhooks to Tripistic.
eyebrow: Ecosystem
category: Platform
icon: plug
order: 8
publishedAt: 2026-07-01
---

Tripistic replaces most of the tools an operator strings together, and connects cleanly to the ones worth keeping.

## Payments — Stripe

**What it does:** checkout, payment links, deposits, refunds, disputes, and signed webhooks that confirm bookings.

**Setup:** Settings → Payments → Connect Stripe. Copy the webhook signing secret into Tripistic. Test in Stripe test mode first.

Full detail in [Payments](/docs/payments).

## Maps — Google Maps Platform

**What it does:** geocodes meeting points and pickup addresses, renders maps on booking pages and trip timelines, and provides distance context for itinerary planning.

**Setup:** Settings → Integrations → Maps. Add an API key restricted to your domains, with Geocoding, Maps JavaScript, and Places enabled.

## Calendars — Google Calendar

**What it does:** publishes departures to a calendar your team already lives in, so guides and drivers see assignments alongside everything else.

**Setup:** Settings → Integrations → Calendar. Authorise, then choose which tours sync and whether participant details are included. Availability changes propagate; the calendar is a read-only mirror, so edit departures in Tripistic.

## Messaging — Twilio and WhatsApp Business

**What it does:** SMS and WhatsApp for departure reminders, delay notices, meeting-point details, and two-way traveller messaging.

**Setup:** Settings → Integrations → Messaging. Add your Twilio credentials and sending number, or connect a WhatsApp Business sender. Configure quiet hours per market.

> Messaging is subject to consent rules — TCPA, GDPR, PECR, and carrier policy. Only message travellers with a lawful basis. See the [Acceptable Use Policy](/legal/acceptable-use-policy).

## AI providers — OpenAI and OpenRouter

**What it does:** powers itinerary generation, business insights, search, and summaries.

**Setup:** Settings → AI providers. Choose a provider, add your API key, and select the model. Enterprise deployments can govern provider choice centrally.

You bring your own key, so usage is billed to your provider account and you control which model handles your data. Customer content is not used to train third-party foundation models.

## Edge and domains — Cloudflare

**What it does:** DNS, TLS, caching, and DDoS protection in front of custom domains used for white-label booking pages and portals.

**Setup:** add the domain in Settings → Domains, create the DNS records shown, and wait for verification. Tripistic tracks DNS status, SSL issuance, and ongoing health for each domain.

## Automation — n8n and Zapier

**What it does:** connects Tripistic events to the rest of your stack — accounting, spreadsheets, Slack, review platforms, internal tools.

**Common automations:**

- New confirmed booking → row in an accounting sheet.
- Cancellation → alert in an operations channel.
- Trip completed → review request in your review platform.
- New lead → task in your project tool.
- Incident reported → notify a safety officer.

**Setup:** use outbound webhooks as the trigger, and the REST API for actions back into Tripistic.

## Webhooks

Subscribe an endpoint to events including `booking.created`, `booking.confirmed`, `booking.cancelled`, `payment.succeeded`, `payment.failed`, `payment.refunded`, `availability.updated`, `departure.status_changed`, `incident.created`, `customer.created`, and `lead.converted`.

Every delivery is signed. **Verify the signature before acting on a payload**, return `2xx` quickly, and process asynchronously. Failed deliveries retry with exponential backoff. See [Webhooks](/developers/webhooks) for the signature scheme and retry schedule.

## REST API

Everything the interface does, the API does — bookings, availability, customers, tours, itineraries, workforce, vehicles, and operations. Authentication, pagination, error format, and rate limits are documented in [API](/docs/api) and the [developer reference](/developers).

## Building your own integration

1. Read [Authentication](/developers/authentication).
2. Register a webhook endpoint and verify signatures.
3. Respect [rate limits](/developers/rate-limits) and back off on `429`.
4. Test against a sandbox workspace before touching production.
5. Import the [OpenAPI document](/openapi.json) into Postman or generate a client.

## Related

- [API](/docs/api) · [Payments](/docs/payments) · [Integrations overview](/integrations)
