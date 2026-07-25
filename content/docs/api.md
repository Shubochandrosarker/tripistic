---
title: API
description: REST API basics — authentication, workspace scoping, resources, pagination, filtering, errors, idempotency, and rate limits.
eyebrow: Developers
category: Platform
icon: code
order: 9
publishedAt: 2026-07-01
---

The Tripistic REST API exposes the same capabilities as the interface. This page is the orientation; the full reference lives in the [developer documentation](/developers).

## Base URL and versioning

```
https://tripistic.com/api
```

Breaking changes ship behind a new path segment. Additive changes — new fields, new endpoints, new enum values — can arrive without a version bump, so **write clients that ignore unknown fields**. Deprecations carry at least 90 days' notice, published in the [Changelog](/changelog).

## Authentication

All authenticated requests carry a bearer token:

```
Authorization: Bearer <token>
```

Tokens inherit the role of the member they were issued under. Issue the narrowest role that satisfies the integration. Full detail in [Authentication](/developers/authentication).

## Workspace scoping

Most resources are nested under a workspace:

```
GET /api/workspaces/{workspaceId}/bookings
```

The workspace in the path must match one your credentials belong to. A mismatch returns `403` — never another tenant's data.

Public, unauthenticated endpoints live under `/api/public/` and expose only what you have chosen to publish.

## Core resources

| Resource | Path |
| --- | --- |
| Bookings | `/workspaces/{id}/bookings` |
| Availability | `/workspaces/{id}/availability` |
| Tours | `/workspaces/{id}/tours` |
| Customers | `/workspaces/{id}/customers` |
| Leads | `/workspaces/{id}/leads` |
| Companies | `/workspaces/{id}/companies` |
| CRM tasks | `/workspaces/{id}/crm-tasks` |
| Guides | `/workspaces/{id}/guides` |
| Vehicles | `/workspaces/{id}/vehicles` |
| Vendors | `/workspaces/{id}/vendors` |
| Itineraries | `/workspaces/{id}/itineraries` |
| Incidents | `/workspaces/{id}/incidents` |
| Public tours | `/public/{workspaceSlug}/tours` |
| Public bookings | `/public/{workspaceSlug}/bookings` |

## Requests and responses

JSON in, JSON out. Send `Content-Type: application/json`. Timestamps are ISO 8601 in UTC. Monetary amounts are integers in the currency's minor unit — `12500` is 125.00.

```json
{
  "data": {
    "id": "bkg_01H8XZ...",
    "status": "CONFIRMED",
    "paymentStatus": "PAID",
    "totalAmount": 12500,
    "currency": "USD",
    "createdAt": "2026-07-01T09:24:11.000Z"
  }
}
```

## Pagination

Cursor-based:

```
GET /api/workspaces/{id}/bookings?limit=50&cursor=eyJpZCI6...
```

```json
{
  "data": [],
  "pagination": { "nextCursor": "eyJpZCI6...", "hasMore": true }
}
```

Follow `nextCursor` until `hasMore` is false. Do not construct cursors yourself — they are opaque.

## Filtering and sorting

```
GET /api/workspaces/{id}/bookings
  ?status=CONFIRMED
  &paymentStatus=UNPAID
  &from=2026-07-01
  &to=2026-07-31
  &sort=-createdAt
```

Prefix a sort field with `-` for descending order.

## Errors

Conventional status codes with a structured body:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Participant count exceeds remaining capacity",
    "details": [{ "field": "participants", "issue": "max_capacity_exceeded" }]
  }
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Malformed or invalid input |
| 401 | `UNAUTHENTICATED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Authenticated but not permitted |
| 404 | `NOT_FOUND` | No such record in this workspace |
| 409 | `CONFLICT` | Capacity exhausted or concurrent modification |
| 422 | `UNPROCESSABLE` | Valid shape, invalid business state |
| 429 | `RATE_LIMITED` | Too many requests — back off |
| 500 | `INTERNAL_ERROR` | Our fault; safe to retry with backoff |

## Idempotency

Send an `Idempotency-Key` header on every POST that creates something:

```
Idempotency-Key: 4f8c2a1e-...
```

Replaying a request with the same key returns the original result instead of creating a duplicate booking. Keys are retained for 24 hours.

## Concurrency

Seat-affecting operations are serialised. Two simultaneous bookings for one remaining seat produce one `201` and one `409` — never an overbooking. Treat `409` as a real outcome and re-read availability before retrying.

## Rate limits

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. On `429`, honour `Retry-After` and back off exponentially. See [Rate Limits](/developers/rate-limits).

## Webhooks

Prefer webhooks over polling. Register an endpoint, verify the signature on every delivery, respond `2xx` quickly, and process asynchronously. See [Webhooks](/developers/webhooks).

## OpenAPI

The machine-readable specification is at [`/openapi.json`](/openapi.json). Import it into Postman or Insomnia, or generate a typed client with your preferred generator.

## Related

- [Developer documentation](/developers) · [Authentication](/developers/authentication) · [Examples](/developers/examples) · [Integrations](/docs/integrations)
