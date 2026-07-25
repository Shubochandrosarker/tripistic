---
title: Authentication
description: Issuing, scoping, rotating, and revoking Tripistic API credentials, plus session auth and public token access.
eyebrow: API Reference
category: Reference
icon: key
order: 1
publishedAt: 2026-07-01
---

Tripistic supports three access modes. Pick the one that matches your integration.

| Mode | Used by | Credential |
| --- | --- | --- |
| API token | Server-side integrations, automation, scripts | `Authorization: Bearer <token>` |
| Session cookie | The first-party web application | HTTP-only session cookie |
| Public token | Guests viewing a specific booking or itinerary | Unguessable token in the URL |

## API tokens

### Issuing

**Settings → API keys → Create key.** Choose the role the key operates under and give it a descriptive name — `zapier-prod`, `accounting-sync`, `ota-bridge`. The secret is shown **once**. Store it in your secret manager immediately.

### Using

```bash
curl https://tripistic.com/api/workspaces/ws_01H8/bookings \
  -H "Authorization: Bearer $TRIPISTIC_API_KEY" \
  -H "Content-Type: application/json"
```

### Scoping

A token inherits the permissions of the role it was issued under, and is bound to a single workspace. It cannot reach another workspace's data even if the caller knows the ID — a mismatched workspace in the path returns `403`.

Issue the narrowest role that satisfies the integration:

| Integration | Role |
| --- | --- |
| Reporting export | Read-only |
| Booking sync from an OTA | Operations |
| Provisioning automation | Admin |

### Rotating

1. Create the replacement key.
2. Deploy it to your integration.
3. Confirm traffic on the new key.
4. Revoke the old key.

Rotate on a schedule, and immediately whenever someone with access to the secret leaves.

### Revoking

Revocation is immediate — in-flight requests using the revoked key fail with `401`.

## Storage rules

- Never commit keys to source control. Use environment variables or a secret manager.
- Never embed a key in client-side JavaScript, a mobile app bundle, or a browser extension. Anything shipped to a browser is public.
- Never log the `Authorization` header.
- Never send keys over unencrypted channels or paste them into support tickets.

If a key is exposed, revoke it first and investigate second.

## Errors

| Status | Code | Cause |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | Missing, malformed, expired, or revoked token |
| 403 | `FORBIDDEN` | Valid token, insufficient role or wrong workspace |
| 429 | `RATE_LIMITED` | Too many requests for this credential |

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This credential does not have access to workspace ws_01H9"
  }
}
```

Distinguish the two in your client: `401` means fix the credential, `403` means fix the scope or role. Neither should be retried unchanged.

## Public token access

Guest-facing endpoints authenticate with an unguessable token in the URL rather than a credential:

```
GET /api/public/bookings/{publicToken}
GET /api/public/itineraries/{publicToken}
```

These are scoped to a single record and grant only what a traveller needs — viewing the booking, paying, signing a waiver, reading the trip timeline. Treat public tokens as sensitive: anyone with the URL has that access. They can be rotated per booking if a link is exposed.

## Public catalog endpoints

Tour catalog and availability endpoints under `/api/public/{workspaceSlug}/` are unauthenticated by design, so booking widgets can run in the browser. They expose only what you have chosen to publish, and are rate-limited by IP.

## Session authentication

The first-party application uses HTTP-only, same-site session cookies with CSRF protection. Sessions rotate on privilege change and are invalidated when a member is removed. Session auth is not intended for third-party integrations — use an API token.

## Webhook authentication

Webhooks authenticate in the other direction: Tripistic signs each delivery so **you** can verify it came from us. Always verify before acting on a payload. See [Webhooks](/developers/webhooks).

## Checklist

- [ ] Key stored in a secret manager, not source control
- [ ] Narrowest sufficient role
- [ ] Rotation scheduled and documented
- [ ] `401` and `403` handled distinctly
- [ ] `429` handled with backoff
- [ ] Webhook signatures verified

## Related

- [REST API](/developers/rest-api) · [Rate Limits](/developers/rate-limits) · [Examples](/developers/examples)
