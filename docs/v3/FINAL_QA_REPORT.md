# Tripistic V3 — Final QA Report

Date: 2026-08-08 (V3) · updated 2026-08-09 (remediation pass)
Branch: `claude/tripistic-production-upgrade-62u450`
Baseline: `main` @ `471f007` (v2.0.0)
Change: 52 files, +11,189 / −7

## Verdict

```
NOT READY FOR PRODUCTION
```

Every gate that *was* run passes, and everything built here is tested. The
verdict is not about defects found; it is about scope not delivered. The V3
brief specifies twenty phases and this release completes roughly the backend
half of them. Declaring it ready would mean claiming a Site Builder with no
editor and an AI platform with no chat surface are finished products.

The blockers are listed at the end. None of them are "something is broken".

---

## Status by area

| Area | Status | Notes |
|---|---|---|
| Phase 0 — repository audit | **PASS** | `CURRENT_STATE_AUDIT.md`; corrects two stale claims in `docs/AUDIT.md` |
| Phase 1 — Cloudflare integration layer | **PASS** | client, per-capability detection, signed service auth, replay store |
| Phase 2 — Site Builder data + backend | **PASS** | 30 section types, 7 templates, 10 API routes, all gated |
| Phase 3 — Site Builder UI / visual editor | **FAIL** | not built |
| Phase 4 — Workers for Platforms deployment | **PARTIAL** | user-Worker generation, upload, health check, rollback complete; the dispatch Worker is not in this repository |
| Phase 5 — custom domain completion | **PASS** | lifecycle already worked; V3 adds site binding with both entitlements enforced |
| Phase 6 — Super Admin V3 | **PARTIAL** | `checkCloudflareHealth()` built; the navigation and admin pages are not |
| Phase 7 — AI shared infrastructure | **PASS** | tasks, metering, tools, safety, gateway routing |
| Phase 8 — RAG knowledge system | **PASS** | ingestion, chunking, filtered retrieval, deletion, reindex job |
| Phase 9 — workspace AI Copilot | **FAIL** | no chat surface |
| Phase 10 — public Travel Advisor | **FAIL** | no chat surface |
| Phase 11 — AI site generation | **FAIL** | not built |
| Phase 12 — x402 | **FAIL** | data model only; documented as unimplemented, flag removed from the catalogue |
| Phase 13 — usage metering / entitlements | **PASS** | credits enforced, new feature and limit keys, coverage guard extended |
| Phase 14 — SEO / performance / accessibility | **PARTIAL** | generated sites emit metadata, canonical, sitemap, robots, narrow structured data, skip link, WCAG-AA-gated theme; no Lighthouse or axe run performed |
| Phase 15 — security hardening | **PARTIAL** | see `SECURITY.md`; CSP now served report-only, still allows inline script |
| Phase 16 — test suite | **PASS** | +222 tests, all green |
| Phase 17 — staging validation | **NOT CONFIGURED** | no Cloudflare account available in this environment |
| Phase 18 — documentation | **PASS** | 15 files under `docs/v3/` |
| Phase 19 — production readiness | **PASS** | this report |

---

## Gates executed

```
npm ci                     → pass
npx prisma generate        → pass
npx prisma validate        → pass
npm run lint               → pass
npm run typecheck          → pass
npm run test:unit          → 435 passed (27 files)
npm run test:integration   → 396 passed (40 files)
npm run build              → pass
npx prisma migrate deploy  → pass (applied to the test database)
npm run test:e2e           → 20 passed (7 files)   [added 2026-08-09]
```

Baseline was 279 unit / 330 integration. No pre-existing test was modified
except the entitlement-coverage gate map, which was **extended** — it now also
sweeps the new `sites/` and `knowledge/` route areas.

`npm run test:e2e` **was** run in the 2026-08-09 remediation pass: 20 passed,
including 13 new assertions in `tests/e2e/above-the-fold.spec.ts`. The original
statement in this report — that it had not been run — was correct when written
and is superseded.

---

## Verified security properties

Each of these is a test, not a claim:

- A signed edge request cannot have its workspace, path, query, method, body or
  nonce changed without invalidating the signature.
- A captured request cannot be replayed, even inside the freshness window, and
  8 concurrent copies of one nonce admit exactly one winner.
- A valid signature does not grant a workspace: the row is looked up, and
  unknown or suspended workspaces are refused.
- Workspace B cannot retrieve workspace A's private knowledge — with the score
  floor removed, with a large `topK`, after a reindex, with spoofed vector
  metadata, or with an instruction injected into the document.
- An anonymous public caller has no code path to any private vector.
- Deleting a knowledge source deletes its vectors; one workspace cannot delete
  another's source.
- A tool call is authorised by the session: wrong workspace, wrong role and no
  session are all refused, and no tool accepts a `workspaceId`.
- No tool exists for publishing, refunding, cancelling or changing a plan.
- `javascript:`, `data:`, `vbscript:` and `file:` URLs cannot enter a page.
- Script payloads in headings, prose, attributes, link labels and JSON-LD are
  all escaped.
- A hostile page payload cannot escape the Worker's JSON string literal —
  proven by evaluating the line and asserting the injected statement did not run.
- Tripistic attribution cannot be removed without the white-label entitlement,
  regardless of the footer section's own prop.
- A plan without `storefront_builder` cannot create a site even by calling the
  service directly.

---

## PARTIAL / FAIL detail

### Site Builder visual editor — FAIL
- **Problem** — no dashboard UI for composing sections, drag-reorder,
  breakpoints, undo/redo or autosave.
- **Severity** — high for the product, none for correctness.
- **Affected** — `app/dashboard/website`.
- **Reason** — the editor is a large front-end build; the backend it needs was
  the prerequisite and was prioritised.
- **Fix** — build against the existing API; the schema is the component
  contract and `SITE_SECTION_TYPES` enumerates it.
- **Production impact** — operators cannot use the Site Builder. The v2
  storefront is unaffected and still works.

### AI chat surfaces — FAIL
- **Problem** — no `/ai`, no `/dashboard/ai`, no marketing assistant, and no
  provider call loop turning a task profile into an HTTP request.
- **Severity** — high for the product, none for correctness.
- **Affected** — `lib/ai/router` (not written), `app/ai`, `app/dashboard/ai`.
- **Reason** — the surfaces are the last layer; isolation, metering, tools and
  retrieval had to be right first, and they are the parts that are dangerous to
  get wrong.
- **Fix** — a provider client per task profile, then the conversation routes.
  `AiConversation`/`AiConversationMessage` already model the storage.
- **Production impact** — no AI feature is user-reachable. Nothing regresses.

### Dispatch Worker — PARTIAL
- **Problem** — this release generates and uploads *user* Workers. The dispatch
  Worker mapping `hostname → site → user Worker` is not in the repository.
- **Severity** — high; without it published sites have no public route.
- **Affected** — Cloudflare account configuration.
- **Fix** — a small Worker bound to the namespace; documented in
  `PRODUCTION_DEPLOYMENT.md`.
- **Production impact** — publishing succeeds and the script exists, but the
  hostname does not resolve to it.

### Super Admin V3 — PARTIAL
- **Problem** — the Cloudflare health probes exist; the admin navigation, AI
  usage views and deployment views do not.
- **Severity** — medium; the owner cannot see AI cost or deployment failures
  without querying PostgreSQL.
- **Fix** — pages over `checkCloudflareHealth()`, `workspaceUsageSummary()` and
  `SiteDeployment`.

### Application CSP — PARTIAL (improved 2026-08-09)
- **Was** — no `Content-Security-Policy` at all.
- **Now** — `Content-Security-Policy-Report-Only` on every application route,
  with Stripe's script/API/frame origins allowed and `frame-ancestors 'none'`,
  `base-uri`, `form-action`, `object-src 'none'` set. `/embed/**` excluded so
  operator-hosted booking widgets keep working.
- **Remaining** — report-only, and `'unsafe-inline'` is still allowed in
  `script-src` because the theme bootstrap must run before first paint.
  Promoting to enforced needs a week of violation data; removing inline needs
  nonce plumbing.
- **Guarded by** — `tests/unit/security-headers.test.ts`, which fails if
  anyone renames the header to the enforcing form.

### Rate limits partially wired — PARTIAL
- **Problem** — rules exist for six V3 surfaces; only `knowledgeUpload` is
  wired, because it is the only one whose route exists.
- **Severity** — low now, medium once chat and publish are user-facing.
- **Fix** — wire each as its route ships.

### Vectorize filter not verified against Cloudflare — PARTIAL
- **Problem** — isolation tests run against the in-memory store, which
  faithfully implements the filter semantics Tripistic emits, but cannot prove
  Cloudflare honours them.
- **Severity** — medium. It is the one isolation property with no automated
  proof.
- **Fix** — the explicit staging checklist item in `STAGING_DEPLOYMENT.md`, plus
  the metadata indexes that pre-query filtering requires.
- **Mitigation already in place** — retrieval re-checks each chunk's document
  row against the caller's scope and drops mismatches, so a filter failure
  would still not leak.

### Playwright — PARTIAL
- Existing specs unchanged and not run here. No V3 specs written.

### x402 — FAIL (by decision)
See `docs/v3/X402.md`. Data model only. The `x402_api` plan flag was removed
rather than left defined-but-unenforced, so the entitlement-coverage guard stays
meaningful.

### Cloudflare infrastructure — NOT CONFIGURED
No Cloudflare account, dispatch namespace, Vectorize index, R2 bucket, AI
Gateway or DNS exists in this environment. This is an external-resource
prerequisite, not an application defect.

### Observed flake — INFORMATIONAL
`business-brain.test.ts > reports hasEnoughData: false …` failed twice in
roughly twenty full-suite runs, never in six consecutive isolated runs. It is a
pre-existing test over pre-existing code that V3 does not touch; the added
suites raise concurrent load on the shared test database, which appears to
surface it. Recorded rather than hidden.

---

## Blockers before READY

1. Build the dispatch Worker and route `*.tripistic.site` to it.
2. Build the Site Builder editor, or keep `storefront_builder` off for
   customers.
3. Build the AI chat surfaces and the provider call loop, or keep
   `TRIPISTIC_AI_ENABLED=false`.
4. Complete the staging checklist against a real Cloudflare account, including
   the Vectorize cross-tenant check.
5. Promote the CSP from report-only to enforced after a week of violation
   data, and nonce the theme script so `'unsafe-inline'` can be dropped.
6. Wire the remaining rate limits as their routes ship.
7. Run `npm run test:e2e` against a deployed staging environment. (It now
   passes locally against a production build; staging is still untested.)
8. Add Super Admin views for AI usage, cost and deployments.

## Remediation pass — 2026-08-09

A follow-up brief listed ten open production issues. Six of the ten need SSH
access to the VPS, which this environment does not have; four were repository
changes and are done. Full detail and the reality-vs-brief differences are in
`docs/v3/REMEDIATION_2026-08-09.md`.

Two of the brief's stated root causes did **not** reproduce and are documented
as such rather than silently "fixed":

- The invisible hero was attributed to `whileInView` not firing for
  already-visible elements. With scripting on, it does fire. The reproducible
  failure is scripting *off* — measured, fixed, and now covered by a test.
- The `/login` lockout was attributed to NextAuth throwing on an undecryptable
  JWT. Tested by minting a JWE under one `AUTH_SECRET` and serving under
  another: `next-auth@5.0.0-beta.32` clears the cookie and carries on. The
  fail-soft wrapper was kept as defence in depth, and its comment says so.

## What is safe to deploy today

The entire change set is safe to deploy with `TRIPISTIC_AI_ENABLED=false` and
no `CLOUDFLARE_DISPATCH_NAMESPACE`. In that configuration every V3 capability
is dormant, the migration is additive with no backfill, and all 831 tests pass —
including the 609 that existed before this work and were not modified.
