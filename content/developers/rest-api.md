---
title: REST API
description: Resources, conventions, pagination, filtering, idempotency, concurrency, and error handling for the Tripistic REST API.
eyebrow: API Reference
category: Reference
icon: server
order: 2
publishedAt: 2026-07-01
---

A predictable JSON API over the same domain model the interface uses.

## Conventions

| Concern | Convention |
| --- | --- |
| Base URL | `https://tripistic.com/api` |
| Format | JSON request and response bodies |
| Timestamps | ISO 8601, UTC (`2026-07-01T09:24:11.000Z`) |
| Money | Integer minor units (`12500` = 125.00) plus an ISO 4217 `currency` |
| IDs | Opaque prefixed strings (`bkg_`, `cus_`, `tour_`, `avl_`) |
| Enums | UPPER_SNAKE_CASE |
| Envelope | `{ "data": ... }` on success, `{ "error": ... }` on failure |

Treat IDs as opaque and ignore unknown fields — both are required for forward compatibility.

## Workspace scoping

```
/api/workspaces/{workspaceId}/{resource}
```

The workspace must match your credential's workspace. Public endpoints use the workspace **slug** instead:

```
/api/public/{workspaceSlug}/tours
```

## Resource index

### Bookings

```
GET    /workspaces/{id}/bookings
POST   /workspaces/{id}/bookings
GET    /workspaces/{id}/bookings/{bookingId}
PATCH  /workspaces/{id}/bookings/{bookingId}
POST   /workspaces/{id}/bookings/{bookingId}/status
POST   /workspaces/{id}/bookings/{bookingId}/checkin
POST   /workspaces/{id}/bookings/{bookingId}/payment-link
```

### Tours and availability

```
GET    /workspaces/{id}/tours
POST   /workspaces/{id}/tours
GET    /workspaces/{id}/tours/{tourId}
PATCH  /workspaces/{id}/tours/{tourId}
GET    /workspaces/{id}/availability
POST   /workspaces/{id}/availability
PATCH  /workspaces/{id}/availability/{availabilityId}
GET    /workspaces/{id}/blackout-dates
```

### CRM

```
GET    /workspaces/{id}/customers
POST   /workspaces/{id}/customers
GET    /workspaces/{id}/customers/{customerId}
GET    /workspaces/{id}/customers/{customerId}/timeline
GET    /workspaces/{id}/leads
GET    /workspaces/{id}/companies
GET    /workspaces/{id}/crm-tasks
```

### Workforce, fleet, and operations

```
GET    /workspaces/{id}/guides
GET    /workspaces/{id}/guides/{memberId}/time-off
GET    /workspaces/{id}/vehicles
GET    /workspaces/{id}/vendors
GET    /workspaces/{id}/incidents
POST   /workspaces/{id}/incidents
```

### Itineraries

```
GET    /workspaces/{id}/itineraries
POST   /workspaces/{id}/itineraries
GET    /workspaces/{id}/itineraries/{itineraryId}
POST   /workspaces/{id}/itineraries/{itineraryId}/items
```

### Public

```
GET    /public/{workspaceSlug}/tours
GET    /public/{workspaceSlug}/tours/{tourSlug}
GET    /public/{workspaceSlug}/tours/{tourSlug}/availability
POST   /public/{workspaceSlug}/bookings
GET    /public/bookings/{publicToken}
POST   /public/bookings/{publicToken}/waiver
POST   /public/bookings/{publicToken}/payment/retry
```

## Creating a booking

```bash
curl -X POST https://tripistic.com/api/workspaces/ws_01H8/bookings \
  -H "Authorization: Bearer $TRIPISTIC_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 4f8c2a1e-9d33-4a11-b2c7-77c9a1e0f2b4" \
  -d '{
    "availabilityId": "avl_01H8XZ",
    "customer": { "name": "Ana Ruiz", "email": "ana@example.com" },
    "participants": [
      { "name": "Ana Ruiz", "ageBand": "ADULT" },
      { "name": "Marco Ruiz", "ageBand": "ADULT" }
    ],
    "addOns": [{ "id": "add_01H8QQ", "quantity": 2 }],
    "paymentMode": "PAYMENT_LINK"
  }'
```

```json
{
  "data": {
    "id": "bkg_01H8XZ",
    "status": "PENDING",
    "paymentStatus": "UNPAID",
    "totalAmount": 24000,
    "currency": "USD",
    "paymentLinkUrl": "https://tripistic.com/book/confirmation/pbt_9f2a...",
    "expiresAt": "2026-07-01T10:24:11.000Z"
  }
}
```

## Pagination

```
GET /workspaces/{id}/bookings?limit=50&cursor=eyJpZCI6...
```

```json
{
  "data": [],
  "pagination": { "nextCursor": "eyJpZCI6...", "hasMore": true }
}
```

Cursors are opaque — never construct or modify them. `limit` defaults to 25 and maxes at 100.

## Filtering and sorting

| Parameter | Example |
| --- | --- |
| `status` | `status=CONFIRMED` |
| `paymentStatus` | `paymentStatus=UNPAID` |
| `from` / `to` | `from=2026-07-01&to=2026-07-31` |
| `tourId` | `tourId=tour_01H8` |
| `q` | `q=ruiz` |
| `sort` | `sort=-createdAt` |

Combine freely; unknown parameters are ignored.

## Idempotency

Send `Idempotency-Key` on every creating POST. Replays return the original response instead of duplicating the record. Keys are retained 24 hours. Use a fresh UUID per logical operation, not per retry.

## Concurrency

Seat-affecting writes are serialised. Concurrent requests for one remaining seat yield exactly one `201` and one `409 CONFLICT`. Treat `409` as expected: re-read availability, then decide whether to retry.

## Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Participant count exceeds remaining capacity",
    "details": [{ "field": "participants", "issue": "max_capacity_exceeded" }]
  }
}
```

| Status | Code | Retry? |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | No — fix the request |
| 401 | `UNAUTHENTICATED` | No — fix the credential |
| 403 | `FORBIDDEN` | No — fix the scope |
| 404 | `NOT_FOUND` | No |
| 409 | `CONFLICT` | Only after re-reading state |
| 422 | `UNPROCESSABLE` | No |
| 429 | `RATE_LIMITED` | Yes — honour `Retry-After` |
| 5xx | `INTERNAL_ERROR` | Yes — exponential backoff |

## Related

- [Authentication](/developers/authentication) · [Webhooks](/developers/webhooks) · [Rate Limits](/developers/rate-limits) · [OpenAPI](/developers/openapi)
