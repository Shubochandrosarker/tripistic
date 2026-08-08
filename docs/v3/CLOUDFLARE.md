# Cloudflare Integration

## Capability detection

Every capability is detected independently (`lib/cloudflare/config.ts`). Having
an account id does not imply having a dispatch namespace; having a zone does not
imply having Vectorize. A missing credential disables exactly the feature it
belongs to and nothing else.

| Capability | Requires | Disabled behaviour |
|---|---|---|
| `account` | token + `CLOUDFLARE_ACCOUNT_ID` | no account-scoped calls |
| `customHostnames` | token + zone | domains fall back to `ManualHostnameProvider` |
| `workersForPlatforms` | token + account + `CLOUDFLARE_DISPATCH_NAMESPACE` | Publish builds and stores a revision, reports it was not deployed |
| `r2` | token + account + `CLOUDFLARE_R2_BUCKET` | assets use the configured S3 storage |
| `vectorize` | token + account + `CLOUDFLARE_VECTORIZE_INDEX` | in-process vector store (dev/CI only) |
| `aiGateway` | gateway account + gateway id | model calls go direct to the provider |
| `workersAi` | token + account | embeddings fall back to a deterministic hash |

## HTTP client

`lib/cloudflare/client.ts` is the only place the v4 API is spoken.

- Unwraps the `{success, errors, result}` envelope once.
- `CloudflareApiError.code` carries Cloudflare's numeric code, not the HTTP
  status — callers need it to tell "hostname already exists" (1406) from a
  generic 400.
- Retries **only** 429 and 5xx, and **only** for idempotent methods. Retrying a
  POST that creates a Worker script would deploy twice.
- `tolerateCodes` turns expected-absent cases (10007, script not found) into
  `null` instead of an exception.
- The token is read at call time, never held on the instance, and never logged.

## Service authentication

`lib/cloudflare/signatures.ts` — Web Crypto only, so the same file runs in a
Worker and in Node.

Canonical string (newline-delimited):

```
v1
<METHOD>
<path with query>
<unix seconds>
<nonce>
<sha256 hex of body>
<claimed workspaceId or empty>
```

Headers: `x-tripistic-signature: v1=<hex>`, `-timestamp`, `-nonce`,
`-request-id`, `-workspace`, `-key-id`.

Verification rejects: missing parts, unknown version, non-numeric timestamp,
skew over ±300s in either direction, bad signature (constant-time compare), and
a reused nonce (`service_request_nonces`, primary-key insert — the insert *is*
the check).

**A valid signature proves "a Tripistic Worker", not "this tenant's Worker."**
Every site Worker is signed with the same secret. `resolveEdgeWorkspace` looks
the workspace up in PostgreSQL and refuses one that is missing or suspended.

## Naming

`CLOUDFLARE_ENVIRONMENT` suffixes resource names and defaults to `development`,
never `production`:

```
tripistic-sites-development | -staging | -production
tripistic-rag-staging | -production
```

## Manual setup still required

See `docs/v3/PRODUCTION_DEPLOYMENT.md`. Nothing in this repository creates a
Cloudflare account, a dispatch namespace, a Vectorize index, an R2 bucket, an AI
Gateway, or DNS records.
