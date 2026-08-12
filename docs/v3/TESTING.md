# Testing (V3)

## Commands and results

Run at the end of this work, on PostgreSQL 16 / Node 22.22:

```
npm run lint                → pass
npm run typecheck           → pass
npx prisma validate         → pass
npm run test:unit           → 499 passed (31 files)
npm run test:integration    → 440 passed (43 files)
npm run test:e2e            → 27 passed (6 files)
npm run build               → pass
```

Baseline before any V3 change: 279 unit, 330 integration. The first V3 pass took
that to 435 / 396; this pass — the UI surfaces, the provider layer, the dispatch
Worker and x402 — takes it to 499 / 440 / 27.

No existing test was weakened. Two were *changed*: the security-header suite
gained an assertion that `frame-src` allows the editor's own preview frame, and
the entitlement-coverage gate map was extended to the new route areas.

## Running integration tests

Needs PostgreSQL and a `.env.test` whose `DATABASE_URL` contains
`tripistic_test` — `tests/integration/global-setup.ts` refuses otherwise,
because it truncates every table. One test also needs any non-empty
`STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.

## What the V3 suites cover

**`tests/unit/edge-signatures.test.ts`** (28) — the signing scheme. Tamper
matrix: workspace header, query string, path, method, body, nonce. Freshness in
both directions. Missing and malformed parts. Constant-time comparison.

**`tests/unit/cloudflare-config.test.ts`** (14) — per-capability detection, that
one credential never implies another, environment defaulting to development,
the Vectorize tenant filter, and that the AI Gateway caches public chat only.

**`tests/unit/site-schema.test.ts`** (45) — section union, duplicate ids,
section cap, `javascript:`/`data:`/`vbscript:`/`file:` rejection in both `src`
and `href` positions, required alt text, path normalisation and reserved
prefixes, subdomain rules including punycode, the WCAG contrast refusal, and
that every template's own pages validate.

**`tests/unit/site-render.test.ts`** (25) — escaping in headings, prose,
attributes, link labels and JSON-LD; structured data emitted narrowly; preview
noindex; attribution forced on without the white-label entitlement; and the
Worker payload literal proven unescapable by evaluating it.

**`tests/unit/ai-chunking-safety.test.ts`** (33) — chunking keeps qualifiers
with the claims they qualify, delimiter neutralisation, injection scanning
without false positives on ordinary questions, output validation, integer cost
arithmetic, UTC month windows.

**`tests/integration/edge-service-auth.test.ts`** (11) — nonce single-use under
8-way concurrency, replay rejection end to end, body tampering, and workspace
resolution refusing unknown and suspended workspaces.

**`tests/integration/sites.test.ts`** (19) — the full lifecycle, tenancy on
every read and write, plan gating, publish versioning, refusal to publish
without a homepage, and rollback restoring the draft.

**`tests/integration/rag-tenant-isolation.test.ts`** (19) — the mandated
scenario and its hard cases. See `RAG.md` for what it proves and what it cannot.

**`tests/integration/ai-tools.test.ts`** (17) — authorisation from the session
rather than the conversation: wrong workspace, wrong role, no session, borrowed
ids, PII absent from results, proposals that mutate nothing.

## Added in this pass

**`tests/unit/ai-provider-stream.test.ts`** (12) — the provider wire format,
against a stubbed `fetch`. Chunk boundaries are placed adversarially: mid-JSON,
mid-frame. Two assertions matter most. Tool-call arguments arriving a few
characters at a time must reassemble by array index — the id and name appear
only in the first chunk, so index is the only join key the protocol offers — and
a wrongly reassembled call still *looks* like a call, which the permission layer
would then authorise with the wrong arguments. And the API key must appear in
the `Authorization` header and nowhere else, including the gateway metadata
header that is a second copy of request context sent to Cloudflare.

**`tests/unit/ai-router.test.ts`** (12) — Zod→JSON Schema conversion walked over
the real `AI_TOOLS` registry, so a tool added with an unsupported construct
fails CI rather than shipping a descriptor that lies to the model. Also asserts
every system prompt carries `UNTRUSTED_CONTENT_POLICY` verbatim: a new surface
that retrieves but forgets the clause is how an injected document becomes
authoritative.

**`tests/unit/site-section-registry.test.ts`** (14) — the editor against the
schema. Every section type must produce a valid section when added, every field
descriptor must name a real prop, and every required prop must have an editor
field. A default that fails validation is an "Add section" button that throws
for one type only — the kind of defect that ships because nobody clicks all
thirty.

**`tests/unit/dispatch-worker.test.ts`** (18) — routing, colo caching, stale
fallback, security headers and the branded failure pages, with `caches.default`
and the namespace binding stubbed. Includes the signing-parity assertion: the
Worker's canonical string must be byte-identical to Core's, and Core must accept
a Worker-produced signature.

**`tests/integration/ai-chat-turn.test.ts`** (14) — the turn loop through a
scripted invoker. Tool dispatch, the per-turn ceiling, malformed arguments,
output rejection, credit metering, and four access assertions: another
workspace's thread does not resolve, a colleague cannot open a member's thread,
a public token cannot reach a workspace thread, and anonymous tokens are
unguessable and distinct.

**`tests/integration/x402.test.ts`** (21) — configuration safety (including the
two-key mainnet rule), replay under concurrency, grant exhaustion under
concurrency, route scoping, and the assertion that a verified x402 payment
writes no row to the booking payment tables.

**`tests/integration/feature-overrides.test.ts`** (9) — that a grant with an end
date actually ends, in all three resolvers, for grants and for denials.

**`tests/e2e/site-builder.spec.ts`** (7) — the editor in a real browser.

## Two defects the tests found

Worth recording, because both were invisible to review:

1. **Conversation message ordering.** Messages were sorted by `created_at`, but
   the two halves of an exchange are written in one transaction and PostgreSQL's
   `now()` is transaction time — so both rows carried the same timestamp and the
   assistant turn sorted before the question about half the time. Fixed with an
   explicit `sequence` column, a unique index and a backfill.
2. **CSP would have blanked the editor preview.** `frame-src` had no `'self'`,
   and a `srcdoc` iframe is matched against it using the embedding document's
   URL. Report-only mode meant this would only have appeared on the day the
   policy was promoted.

## A note on the e2e login budget

`RATE_LIMITS.login` allows ten attempts per IP per fifteen minutes and the whole
Playwright run comes from one address. Adding a spec with a per-test login
pushed the suite over that ceiling and the later tests failed at the sign-in
form — which reads as a broken feature and is really the limiter working
correctly. The Site Builder spec logs in once for the file. The suite now spends
six of the ten; a future spec should follow the same pattern rather than raise
the limit.

## Not covered

- **No live model provider call.** The provider layer is tested against a
  stubbed `fetch` and the turn loop through an injected invoker. A real
  provider's exact SSE dialect has not been observed here.
- **No live x402 facilitator.** Verification is tested through an injected
  client.
- Any test against real Cloudflare infrastructure — the dispatch Worker is
  tested with its runtime globals stubbed, not deployed.
- AI site generation, which is not implemented.
- Load and performance testing of generated sites; no Lighthouse or axe run.

## `tests/e2e/above-the-fold.spec.ts`

Added during the V3 remediation pass. Asserts that the first screen of `/`,
`/pricing` and `/features` is visible without scrolling, **with and without
JavaScript**, and that a malformed session cookie never 500s `/login`,
`/dashboard` or `/admin`.

The subtle part is why it measures *effective* opacity up the ancestor chain:
`getComputedStyle(el).opacity` on an `<h1>` inside an `opacity: 0` wrapper
returns `"1"`, so a check written the obvious way passes on a completely
invisible page — verified, that is exactly what happened to the first draft of
this spec. It was then confirmed to fail on the unfixed build before being
accepted.

## Observed flake

`tests/integration/business-brain.test.ts > reports hasEnoughData: false …`
failed twice in roughly twenty full-suite runs and never in six consecutive
isolated runs of that file. It is a pre-existing test over pre-existing code
that V3 does not touch; the added suites increase concurrent load on the shared
test database, which appears to surface it. Reported rather than hidden;
diagnosing it is a separate piece of work.
