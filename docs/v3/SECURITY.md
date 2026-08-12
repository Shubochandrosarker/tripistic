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
| Rate limiting | AI chat (workspace + public), knowledge upload, x402 | wired; publish/generation/domain buckets still defined-only |
| AI provider secrets | read at call time into an `Authorization` header only; never returned, never in gateway metadata | enforced, tested |
| Anonymous advisor sessions | 32-byte token in an httpOnly, SameSite=Lax cookie; never in a URL | enforced, tested |
| Conversation privacy | threads are per-user inside a workspace; membership is not consent to read a colleague's | enforced, tested |
| Feature-override expiry | `expiresAt` honoured by all three resolvers; plan rows can never expire (CHECK) | enforced, tested |
| x402 replay | unique index on `transaction_reference`, claimed before the facilitator is called | enforced, tested |
| x402 grant redemption | conditional `UPDATE`; token stored as SHA-256 only; route-scoped | enforced, tested |
| Dispatch routing exposure | `/api/internal/site-routing` behind signed edge auth | enforced |
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

## The V3 surfaces added since the first pass

**Chat endpoints.** Both the Copilot and the public Advisor resolve their
workspace from the verified session, never from the request body — which is what
makes a prompt-injected tool call unable to cross a tenant boundary. The Copilot
is gated on `ai_copilot` and rate-limited per *workspace* (spend is attributable
to the workspace whichever member incurs it); the Advisor is rate-limited per IP,
which is the only ceiling an unauthenticated endpoint has.

**The turn loop is bounded twice.** At most four model rounds and at most ten
tool executions per user turn. Rounds bound cost and latency; the total bounds a
single round that requests forty tools at once, which a confused model does and
which the round limit alone would happily pay for.

**Model output is validated before it is stored or shown.** Output containing
what looks like a credential or executable markup is replaced with a notice, and
the renderer never uses `dangerouslySetInnerHTML` — so the check is a second
line of defence rather than the only one.

**The Site Builder preview** renders on the app origin inside a `sandbox=""`
iframe with `no-store` and `X-Robots-Tag: noindex`. It re-validates the draft
content it is asked to render even though it is not saving it: a preview that
renders something the schema would reject teaches the operator it is fine, and
the error then appears at publish.

**Platform-admin actions on tenant resources** (`admin_site_suspended`,
`admin_site_rolled_back`, `admin_feature_override_*`) are named apart from the
operator's own actions, so a workspace reading its history can tell "we did
this" from "Tripistic did this" — the first question an operator asks when their
site changes without them touching it. All of them require a typed reason.

## Known gaps

1. Application CSP is report-only and still allows `'unsafe-inline'` scripts
   (above). `frame-src` now includes `'self'` for the Site Builder preview;
   without it the editor would have gone blank on the day the policy is
   promoted, and report-only mode hides exactly that.
2. Site-publish, site-generation and domain-verification rate limits are defined
   but not wired to their routes.
3. Cloudflare-side WAF rules are account configuration, not repository code —
   see `PRODUCTION_DEPLOYMENT.md`.
4. Vectorize filter enforcement is verified against our own filter semantics,
   not against Cloudflare's implementation. Staging checklist item.
5. No live model provider has been exercised in this environment. The provider
   layer is unit-tested against a stubbed `fetch` covering framing, tool-call
   reassembly, usage, error classes and secret handling; the conversation loop
   is integration-tested through an injected invoker. What has *not* been
   observed is a real provider's exact SSE dialect. Staging checklist item.
6. No facilitator has been exercised against a live testnet. See
   `docs/v3/X402.md`.
