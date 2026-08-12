# V3 Security Controls

| Control | Where | Status |
|---|---|---|
| Tenant isolation (application) | `requireWorkspaceAccess`, every new service scoped by `workspaceId` in the query | enforced, tested |
| Tenant isolation (RAG) | `buildTenantFilter` + typed scope + database re-check | enforced, tested |
| Tenant isolation (tools) | membership re-checked per call; no `workspaceId` argument exists | enforced, tested |
| Service auth (Worker → Core) | HMAC over method+path+body+workspace, ±300s skew, single-use nonce | enforced, tested |
| Replay prevention | `service_request_nonces` primary-key insert; fails **closed** | enforced, tested |
| Stored XSS in tenant pages | closed section vocabulary, Zod URL scheme validation, unconditional escaping | enforced, tested |
| Code injection into Worker bundles | payload embedded as a doubly-stringified JSON literal | enforced, tested (by evaluation) |
| Site CSP | `script-src 'none'`, `frame-ancestors 'none'` on every Worker response | enforced |
| Secrets in Workers | none bound; sites read only the public tours API | enforced by construction |
| Feature entitlement | `assertFeature` (402) on every new gated route | enforced, swept by `entitlement-coverage.test.ts` |
| Usage limits | credits checked before the call, atomic increment, admin override | enforced |
| Rate limiting | new buckets for AI chat, knowledge upload, publish, generation, domain verification | rules defined; wired on knowledge upload |
| Prompt injection | delimiting, scanning, output validation — as signals behind real controls | implemented |
| PII to model providers | tool selects exclude guest name/email/phone; gateway metadata is ids only | enforced |
| Audit | every site and knowledge mutation records an `AuditAction` | enforced |
| Application CSP | report-only, Stripe-aware, `/embed` excluded | shipped, not yet enforced |

## Application CSP

Now served, as **`Content-Security-Policy-Report-Only`** — and it must stay
report-only until a week of real violation data says otherwise. Enforcing a
first-draft policy on a page that loads Stripe breaks checkout *silently*: the
browser blocks the frame, the customer sees a dead button, and nothing appears
in the server logs. `tests/unit/security-headers.test.ts` fails if anyone
promotes it in a tidy-up.

`'unsafe-inline'` remains in `script-src`, and that is the honest limitation.
The theme bootstrap (`components/theme/theme-script.tsx`) is an inline script
that must run before first paint to avoid a flash of the wrong theme; removing
the allowance needs nonce plumbing through it. The policy is still worth having
without that: `frame-ancestors 'none'`, `base-uri`, `form-action` and
`object-src 'none'` all close surface that inline script does not touch.

`/embed/**` is deliberately excluded. It exists to be iframed on an operator's
own website, so `frame-ancestors 'none'` would report every legitimate embed as
a violation and break them outright once enforced.

To promote: collect violations for a week, tighten the source lists to what is
actually used, then rename the header key.

The generated tenant Workers carry a strict *enforced* CSP with
`script-src 'none'`, because they emit no scripts at all — there, the strictest
policy is also the correct one.

HSTS remains deliberately unset from the application, for the reason already
documented in `next.config.ts`: the app answers on operator custom domains whose
TLS it does not control.

## Rate limiting coverage

Rules exist for `aiWorkspaceChat`, `aiPublicChat`, `knowledgeUpload`,
`sitePublish`, `siteGeneration` and `domainVerification`. Only
`knowledgeUpload` is wired, because it is the only one of those surfaces whose
route exists in this release. The AI chat rules will be wired with the chat
routes; publish and domain verification are owner/admin-only and already
entitlement-gated, so they are lower risk but should still be wired before a
public launch of the builder.

AI-cost surfaces are keyed on the **workspace**, not the IP: what is protected
is spend, and spend is attributable to the workspace whichever member or office
IP submits it. The public advisor is the exception and stays IP-keyed, since it
has no workspace.

## Known gaps

1. Application CSP is report-only and still allows `'unsafe-inline'` scripts
   (above).
2. Site-publish and domain-verification rate limits defined but not wired.
3. Cloudflare-side WAF rules are account configuration, not repository code —
   see `PRODUCTION_DEPLOYMENT.md`.
4. Vectorize filter enforcement is verified against our own filter semantics,
   not against Cloudflare's implementation. Staging checklist item.
