---
title: OpenAPI
description: The machine-readable OpenAPI 3.1 specification for the Tripistic REST API, and how to use it for clients, mocks, and contract tests.
eyebrow: API Reference
category: Reference
icon: file-json
order: 7
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

The full API contract is published as an OpenAPI 3.1 document.

## The document

**[`/openapi.json`](/openapi.json)** — served over HTTPS, cached, and versioned with the platform.

```bash
curl https://tripistic.com/openapi.json -o tripistic-openapi.json
```

The `info.version` field tracks the platform version. Pin a downloaded copy in your repository so a specification change never silently alters your generated client — upgrade deliberately.

## What it covers

| Section | Contents |
| --- | --- |
| `servers` | Production base URL |
| `security` | Bearer token scheme |
| `paths` | Bookings, tours, availability, customers, and the public booking endpoints |
| `components.schemas` | Booking, Participant, Tour, Availability, Customer, Error, Pagination |
| `components.parameters` | `workspaceId`, `cursor`, `limit`, date filters |
| `components.responses` | Shared 400 / 401 / 403 / 404 / 409 / 429 responses |

## Generate a client

```bash
# TypeScript types
npx openapi-typescript https://tripistic.com/openapi.json -o src/tripistic.d.ts

# Python
openapi-python-client generate --url https://tripistic.com/openapi.json

# Go
oapi-codegen -package tripistic https://tripistic.com/openapi.json > tripistic.go
```

More detail, plus a hand-rolled client, in [SDKs & Clients](/developers/sdk).

## Explore it interactively

**Postman** — Import → Link → paste the URL. You get a full collection with parameters and schemas. Add `Authorization: Bearer {{apiKey}}` as a collection header and store `apiKey` as an environment secret.

**Insomnia** — Create → Import From → URL.

**Swagger UI / Redoc** — point either at the document to browse it locally:

```bash
npx @redocly/cli preview-docs https://tripistic.com/openapi.json
```

## Mock server

Generate a mock from the specification to build against before writing integration code:

```bash
npx @stoplight/prism-cli mock https://tripistic.com/openapi.json
```

Your client then talks to `http://localhost:4010` with schema-valid responses. This is the fastest way to build a UI against the API without touching a real workspace.

## Contract testing

Validate that your integration still matches the contract in CI:

```bash
# Lint the spec itself
npx @redocly/cli lint https://tripistic.com/openapi.json

# Validate recorded responses against the schema
npx @stoplight/prism-cli proxy https://tripistic.com/openapi.json https://tripistic.com/api \
  --errors
```

Running the proxy in `--errors` mode during integration tests surfaces any response that drifts from the schema.

## Compatibility rules

The specification evolves under the same rules as the API:

- **Additive changes** — new paths, new optional fields, new enum values — ship without a version bump. Generated clients must tolerate unknown fields.
- **Breaking changes** get a new major version and at least 90 days' notice, published in the [Changelog](/changelog) and [Release Notes](/docs/release-notes).
- Deprecated operations are marked `deprecated: true` before removal.

## Reporting a discrepancy

If the specification and the API disagree, that is a bug worth reporting. Send the endpoint, the request, the expected schema, and the actual response to [support@tripistic.com](mailto:support@tripistic.com).

## Related

- [REST API](/developers/rest-api) · [SDKs & Clients](/developers/sdk) · [Authentication](/developers/authentication) · [Examples](/developers/examples)
