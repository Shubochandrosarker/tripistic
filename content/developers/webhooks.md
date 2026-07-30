---
title: Webhooks
description: Event catalog, payload shape, HMAC signature verification, retry schedule, and replay protection for Tripistic webhooks.
eyebrow: API Reference
category: Reference
icon: webhook
order: 3
publishedAt: 2026-07-01
---

> **Status: planned — not yet available.**
>
> Tripistic does not currently expose a public API. There is no API-key model,
> no key-management screen, and no bearer-token authentication path in the
> application: every route authenticates through a signed session cookie.
>
> This page describes the intended design and is published so the direction is
> visible. It is **not** a description of shipped functionality, and nothing on
> it can be called today. It will be replaced with real reference material when
> the API ships.

Webhooks push events to your endpoint as they happen. Prefer them over polling — they are faster, cheaper, and do not consume your rate limit.

## Registering an endpoint

**Settings → Integrations → Webhooks → Add endpoint.**

1. Enter an HTTPS URL. Plain HTTP is rejected.
2. Select the events to subscribe to.
3. Copy the signing secret. It is shown once.

You can register several endpoints — for example one for accounting and one for operations alerts.

## Event catalog

| Event | Fires when |
| --- | --- |
| `booking.created` | A booking is created from any source |
| `booking.confirmed` | Payment verified or manually confirmed |
| `booking.updated` | Participants, add-ons, price, or departure changed |
| `booking.cancelled` | Cancelled by staff or traveller |
| `booking.completed` | Departure finished |
| `payment.succeeded` | Verified successful payment |
| `payment.failed` | Payment attempt failed |
| `payment.refunded` | Full or partial refund recorded |
| `payment.expired` | Pending booking expired and seats released |
| `availability.created` | New departure generated |
| `availability.updated` | Capacity, timing, or assignment changed |
| `availability.cancelled` | Departure cancelled |
| `departure.status_changed` | Boarding, departed, delayed, completed |
| `incident.created` | Incident reported |
| `customer.created` | New customer record |
| `customer.updated` | Customer details changed |
| `lead.created` | New lead captured |
| `lead.converted` | Lead became a customer |
| `waiver.signed` | Participant signed a waiver |
| `itinerary.published` | Itinerary version shared publicly |

## Payload

```json
{
  "id": "evt_01H8XZQ7",
  "type": "booking.confirmed",
  "createdAt": "2026-07-01T09:24:11.000Z",
  "workspaceId": "ws_01H8",
  "apiVersion": "2.0.0",
  "data": {
    "id": "bkg_01H8XZ",
    "status": "CONFIRMED",
    "paymentStatus": "PAID",
    "totalAmount": 24000,
    "currency": "USD",
    "availabilityId": "avl_01H8XZ",
    "customerId": "cus_01H8AB",
    "participantCount": 2
  }
}
```

New fields are added without a version bump. Ignore unknown fields.

## Verifying the signature

Every delivery carries:

```
Tripistic-Signature: t=1751362451,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

The signature is `HMAC-SHA256` over `"{timestamp}.{raw_request_body}"` using your endpoint's signing secret.

**Verify against the raw request body**, before any JSON parsing or framework middleware transforms it. A re-serialised body will not match.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.split("=") as [string, string]),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  // Reject anything older than five minutes.
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Always compare in constant time. A plain `===` on the signature leaks timing information.

## Responding

- Return `2xx` **quickly** — within 5 seconds. Enqueue the work and process asynchronously.
- Any non-`2xx`, or a timeout, is treated as a failure and retried.
- Do not perform slow work inline. Long handlers cause duplicate deliveries.

## Retries

| Attempt | Delay after previous |
| --- | --- |
| 1 | Immediate |
| 2 | 30 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 12 hours |

After six failures the endpoint is marked unhealthy and you are notified. Deliveries can be replayed from the webhook log once you have fixed the endpoint.

## Idempotency and ordering

Deliveries are **at least once**, so the same `id` can arrive more than once — store processed event IDs and skip duplicates.

Ordering is **not guaranteed**. A `booking.confirmed` can arrive before `booking.created`. Key your handlers off the resource ID and the event's `createdAt`, and ignore events older than the state you already hold.

## Replay protection

Reject deliveries whose timestamp is more than five minutes from now, as in the example above. Combined with signature verification this prevents replay attacks.

## Local development

Use a tunnelling tool to expose your local server, register the tunnel URL as a test endpoint, and trigger real events in a sandbox workspace. The webhook log shows request, response, and timing for every attempt.

## Security rules

- Never trust an unverified payload.
- Never use a webhook endpoint as a proxy to third parties.
- Rotate the signing secret if it is exposed; both old and new secrets are accepted during a short overlap.
- Log deliveries without logging the signing secret.

## Related

- [Authentication](/developers/authentication) · [REST API](/developers/rest-api) · [Examples](/developers/examples)
