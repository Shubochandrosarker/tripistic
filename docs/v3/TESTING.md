# Testing (V3)

## Commands and results

Run at the end of this work, on PostgreSQL 16 / Node 22.22:

```
npm run lint                → pass
npm run typecheck           → pass
npx prisma validate         → pass
npm run test:unit           → 435 passed (27 files)
npm run test:integration    → 396 passed (40 files)
npm run build               → see FINAL_QA_REPORT
```

Baseline before any V3 change: 279 unit, 330 integration. V3 added 156 unit and
66 integration tests, and changed no existing test except the
entitlement-coverage gate map, which was extended to cover the new route areas.

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

## Not covered

- Playwright specs for the Site Builder and AI flows. The five existing specs
  are unchanged and untested in this environment (no browser run was performed).
- Any test against real Cloudflare infrastructure.
- Load and performance testing of generated sites.

## Observed flake

`tests/integration/business-brain.test.ts > reports hasEnoughData: false …`
failed twice in roughly twenty full-suite runs and never in six consecutive
isolated runs of that file. It is a pre-existing test over pre-existing code
that V3 does not touch; the added suites increase concurrent load on the shared
test database, which appears to surface it. Reported rather than hidden;
diagnosing it is a separate piece of work.
