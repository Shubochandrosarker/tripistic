---
title: Rate Limits
description: Per-plan request quotas, response headers, backoff strategy, and how to design integrations that never hit a limit.
eyebrow: API Reference
category: Reference
icon: gauge
order: 4
publishedAt: 2026-07-01
---

Rate limits keep the platform responsive for everyone. Designed well, an integration should rarely see one.

## Limits

| Plan | Authenticated requests | Burst |
| --- | --- | --- |
| Solo | 300 / minute | 60 |
| Operator | 600 / minute | 120 |
| Agency | 1,200 / minute | 240 |
| Enterprise | Negotiated | Negotiated |

| Endpoint class | Limit |
| --- | --- |
| Public catalog (`/api/public/*`, unauthenticated) | 120 / minute per IP |
| Public booking creation | 20 / minute per IP |
| Authentication endpoints | 10 / minute per IP |
| AI generation endpoints | 20 / minute per workspace |
| Bulk export endpoints | 10 / minute per workspace |

Limits apply per credential for authenticated calls and per IP for public ones. Webhook deliveries **to** you do not consume your quota.

## Response headers

Every response carries the current state:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 583
X-RateLimit-Reset: 1751362500
```

`X-RateLimit-Reset` is a Unix timestamp for when the window resets.

## When you exceed a limit

```
HTTP/1.1 429 Too Many Requests
Retry-After: 24
```

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Retry after 24 seconds."
  }
}
```

Honour `Retry-After`. Do not retry immediately — it extends the throttle.

## Backoff

Exponential backoff with jitter, capped, with a retry ceiling:

```ts
async function requestWithBackoff(
  url: string,
  init: RequestInit,
  maxAttempts = 5,
): Promise<Response> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, init);

    if (response.status !== 429 && response.status < 500) return response;
    if (attempt === maxAttempts - 1) return response;

    const retryAfter = Number(response.headers.get("Retry-After"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(2 ** attempt * 1000, 30_000);

    // Jitter prevents synchronised clients from retrying in lockstep.
    await new Promise((resolve) => setTimeout(resolve, backoff + Math.random() * 500));
  }

  throw new Error("Exhausted retries");
}
```

Retry `429` and `5xx`. Never retry `400`, `401`, `403`, `404`, or `422` — the same request will fail the same way.

## Designing to stay under the limit

**Use webhooks instead of polling.** A poll every 10 seconds burns 6 requests a minute forever and still lags reality. A webhook fires once, immediately.

**Paginate with a sensible page size.** `limit=100` moves the same data in a quarter of the requests of `limit=25`.

**Filter server-side.** `?status=CONFIRMED&from=2026-07-01` beats fetching everything and filtering in your code.

**Cache what rarely changes.** Tour catalog and workspace settings can be cached for minutes; availability and bookings cannot.

**Batch scheduled work.** Run a nightly sync as one paginated sweep, not thousands of per-record calls.

**Spread scheduled jobs.** If every integration fires at exactly `00:00`, they collide. Add a random offset.

## Concurrency

Keep concurrent in-flight requests per credential modest — 10 or fewer is comfortable for most integrations. High parallelism plus retries is the fastest route to a sustained throttle.

## Bulk operations

For migrations and large imports, contact us before you start. We can advise on sequencing and, for enterprise plans, arrange a temporary elevated limit. Running a migration against production limits without warning usually ends in a throttle mid-import.

## Monitoring

Track `X-RateLimit-Remaining` and alert when it drops below 20% of the limit — that gives you time to fix the pattern before it becomes a `429` in production. Log every `429` with its endpoint so you can find the hot path.

## Related

- [REST API](/developers/rest-api) · [Webhooks](/developers/webhooks) · [SDKs](/developers/sdk)
