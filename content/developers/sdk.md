---
title: SDKs & Clients
description: Generating a typed client from the OpenAPI document, plus a minimal hand-rolled TypeScript client with retries and pagination.
eyebrow: API Reference
category: Reference
icon: package
order: 5
publishedAt: 2026-07-01
---

The API is plain REST with an OpenAPI 3.1 document, so you can generate a client in any language rather than waiting for an official SDK.

## Generate a client

The specification is served at [`/openapi.json`](/openapi.json).

### TypeScript

```bash
npx openapi-typescript https://tripistic.com/openapi.json -o src/tripistic.d.ts
```

Pair the generated types with a typed fetch wrapper such as `openapi-fetch` for end-to-end type safety.

### Python

```bash
pip install openapi-python-client
openapi-python-client generate --url https://tripistic.com/openapi.json
```

### Go

```bash
go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest
oapi-codegen -package tripistic https://tripistic.com/openapi.json > tripistic.go
```

### PHP, Ruby, Java, C#

Use `openapi-generator` with the appropriate generator name:

```bash
openapi-generator generate -i https://tripistic.com/openapi.json -g php -o ./tripistic-php
```

## A minimal TypeScript client

If you would rather not generate code, the API is small enough to wrap by hand. This client handles auth, retries with backoff, and cursor pagination.

```ts
type ClientOptions = { apiKey: string; workspaceId: string; baseUrl?: string };

export class TripisticClient {
  private readonly baseUrl: string;

  constructor(private readonly options: ClientOptions) {
    this.baseUrl = options.baseUrl ?? "https://tripistic.com/api";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/workspaces/${this.options.workspaceId}${path}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });

      if (response.ok) return (await response.json()) as T;

      // Only 429 and 5xx are worth retrying.
      if (response.status !== 429 && response.status < 500) {
        const body = await response.json().catch(() => ({}));
        throw new TripisticError(response.status, body);
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(2 ** attempt * 1000, 30_000);
      await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 500));
    }

    throw new Error("Exhausted retries");
  }

  /** Walks every page so callers can just `for await`. */
  async *paginate<T>(path: string): AsyncGenerator<T> {
    let cursor: string | undefined;

    do {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);

      const page = await this.request<{
        data: T[];
        pagination: { nextCursor?: string; hasMore: boolean };
      }>(`${path}?${query.toString()}`);

      for (const item of page.data) yield item;
      cursor = page.pagination.hasMore ? page.pagination.nextCursor : undefined;
    } while (cursor);
  }

  listBookings<T>() {
    return this.paginate<T>("/bookings");
  }

  createBooking<T>(payload: unknown, idempotencyKey: string) {
    return this.request<{ data: T }>("/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
    });
  }
}

export class TripisticError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Tripistic API error ${status}`);
  }
}
```

### Using it

```ts
const client = new TripisticClient({
  apiKey: process.env.TRIPISTIC_API_KEY!,
  workspaceId: process.env.TRIPISTIC_WORKSPACE_ID!,
});

for await (const booking of client.listBookings<{ id: string; status: string }>()) {
  console.log(booking.id, booking.status);
}
```

## Client design rules

1. **Ignore unknown fields.** New fields ship without a version bump; a strict parser will break.
2. **Treat IDs as opaque strings.** Never parse structure out of them.
3. **Send an `Idempotency-Key` on every creating POST.** Retries must not create duplicate bookings.
4. **Handle `409` explicitly.** Capacity conflicts are a normal outcome, not an exception to swallow.
5. **Never ship a key to a browser.** Proxy through your own server.
6. **Set a request timeout** — 10 seconds for reads, 30 for writes — and pair it with the retry loop.
7. **Send a descriptive `User-Agent`.** It makes support conversations much faster.

## Postman and Insomnia

Import [`/openapi.json`](/openapi.json) directly. Both tools generate a full request collection with parameters and schemas. Set `Authorization: Bearer {{apiKey}}` as a collection-level header and store the key as an environment secret.

## Related

- [REST API](/developers/rest-api) · [OpenAPI](/developers/openapi) · [Examples](/developers/examples) · [Rate Limits](/developers/rate-limits)
