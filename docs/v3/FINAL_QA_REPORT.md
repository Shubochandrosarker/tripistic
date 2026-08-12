# Tripistic V3 â€” Final QA Report

> ## âœ… DEPLOYMENT UPDATE â€” 2026-08-12 (supersedes the verdict below)
>
> **Deploy status: FIXED â€” this build is LIVE in production.** The verdict below
> ("not ready" for lack of infrastructure verification) was resolved later the
> same day: the deploy pipeline was repaired and the release verified against
> real infrastructure.
>
> - **Live commit:** `9af0d26c76b822b270b61d701a4da1027980debe` (`main`, PR #22 + PR #23),
>   confirmed on the VPS and serving at https://app.tripistic.com via GitHub Actions
>   run [31578111565](https://github.com/Shubochandrosarker/tripistic/actions/runs/31578111565)
>   (green, 4m52s, health gate + auto-rollback armed).
> - **Root causes fixed:** (1) `/root/.ssh/authorized_keys` entries were concatenated
>   without newlines (hPanel append bug) so sshd never saw any GHA deploy key â€” file
>   rebuilt and every line validated, fresh ed25519 key rotated in, chat-exposed old
>   keys removed; (2) `VPS_SSH_KEY` repo secret was unparseable â€” replaced via a raw
>   `ssh cat | gh secret set` pipe, no manual paste; (3) the repo's read-only deploy
>   key had been deleted on GitHub â€” restored, plus repo-local `core.sshCommand` so
>   non-interactive `git fetch` works during deploys.
> - **Verified against real infra:** Cloudflare Tunnel `wpistic-vps-prod` routing for
>   `tripistic.com` + `app.tripistic.com` (Tunnel-type DNS, proxied); `/api/health/ready`
>   and `/live` green; Dashboard, Tours (10), Bookings (5 / $1,215), Website builder
>   (published storefront), and Copilot surfaces load without 500s; `POST /api/auth/register`
>   â†’ 201 with verification email actually sent via Resend SMTP; unverified login correctly
>   refused; the 2026-08-06 stale-cookie 500 lockout no longer reproduces; above-the-fold
>   hero renders on load.
> - **AI:** `TRIPISTIC_AI_ENABLED=true`, routed through Cloudflare AI Gateway `42069`;
>   provider keys pending operator input (OpenRouter primary, Groq optional) via
>   `/root/set-ai-keys.sh` on the VPS.
> - **Still open (known, non-blocking):** Stripe self-serve prices unset (6/6 combos â†’
>   checkout 409); Workers-for-Platforms site publishing deliberately dormant; local
>   Ollama/omniroute AI needs a code-level base-URL override to be usable.
> - **Test artifact:** QA account `qa.deploy.20260812@wpistic.com` left in the prod DB
>   (email force-verified during testing; delete or keep as desired).


Date: 2026-08-12
Branch: `claude/v3-repo-audit-build-7tloib`
Baseline: `main` @ `95ebe62`

Supersedes the 2026-08-08 report, which returned `NOT READY FOR PRODUCTION`
because the backend half of V3 had shipped without any of its surfaces. Those
surfaces now exist.

## Verdict

```
NOT READY FOR PRODUCTION
```

The scope is complete and everything built here is tested. The verdict is not
about defects found â€” it is about **verification that this environment cannot
perform**. Three of V3's four headline capabilities have never executed against
the third-party systems they depend on, and one release gate the brief states
explicitly has not been run at all.

Declaring readiness would mean asserting that a chat feature works when no model
has ever answered a request, and that a publishing pipeline works when no Worker
has ever been uploaded. Both are plausible. Neither is verified.

The blockers are listed at the end. **None of them is "something is broken."**

---

## Gates executed

```
npm ci                     â†’ pass
npx prisma generate        â†’ pass
npx prisma validate        â†’ pass
npm run lint               â†’ pass (0 errors, 0 warnings)
npm run typecheck          â†’ pass
npm run test:unit          â†’ 499 passed (31 files)
npm run test:integration   â†’ 440 passed (43 files)
npm run test:e2e           â†’  27 passed (6 files)
npm run build              â†’ pass
```

Baseline recorded at the start of this session, before any change: 439 unit,
396 integration, 27 e2e â€” all green. Nothing regressed; the suite grew by 60
unit, 44 integration and 7 e2e tests.

Worker typecheck and tests run inside the root commands by design: the dispatch
Worker is ~200 lines of edge code, and a second toolchain is a second thing CI
can forget to run. `wrangler deploy --dry-run` was **not** executed â€” `wrangler`
is not installed in this environment.

---

## Status by area

| Area | Status | Notes |
|---|---|---|
| Cloudflare integration layer | **PASS** | client, capability detection, signed service auth, replay store |
| Site Builder data + backend | **PASS** | 30 section types, 7 templates, renderer, publish, rollback |
| Site Builder UI | **PASS** | full Website area; editor with live server-rendered preview, undo/redo, autosave |
| Workers for Platforms | **PASS (code)** / **UNVERIFIED (infra)** | dispatch Worker built and unit-tested; never deployed |
| Custom domains | **PASS (code)** / **UNVERIFIED (infra)** | lifecycle and site binding complete; no real hostname exercised |
| Super Admin V3 | **PASS** | Website Platform, Deployments, AI, Entitlements, x402 |
| AI platform infrastructure | **PASS** | tasks, tools, safety, metering, RAG |
| AI provider layer | **PASS (code)** / **UNVERIFIED (infra)** | one OpenAI-compatible client; no live provider call has been made |
| Workspace Copilot | **PASS (code)** / **UNVERIFIED (infra)** | streaming UI, tool loop, citations, credit meter |
| Public Travel Advisor | **PASS (code)** / **UNVERIFIED (infra)** | two modes, anonymous session, conversion on registration |
| RAG knowledge platform | **PASS** | ingestion, chunking, filtered retrieval, isolation test |
| AI site generation | **NOT BUILT** | prompt exists; no route calls it. Catalogue flag turned off to match |
| x402 | **PASS (code)** / **UNVERIFIED (infra)** | off by default; no live facilitator exercised |
| Entitlements | **PASS** | bounded overrides with expiry honoured by all three resolvers |
| Security hardening | **PARTIAL** | see `SECURITY.md`; CSP still report-only and still allows inline script |
| SEO | **PARTIAL** | generated sites emit metadata, canonical, sitemap, robots, narrow structured data |
| Performance / accessibility | **NOT RUN** | no Lighthouse, no axe, no Core Web Vitals measurement |
| Staging validation | **NOT CONFIGURED** | no Cloudflare account and no provider key in this environment |
| Documentation | **PASS** | 18 files under `docs/v3/` |

---

## What was built in this pass

**The AI provider layer.** The previous pass shipped task profiles, a tool
registry, RAG, safety and metering â€” and nothing that made a model call. That
gap is closed: one OpenAI-compatible client for OpenAI, OpenRouter, Groq and
Workers AI, routed through the AI Gateway when configured, with SSE buffered to
the frame terminator and tool-call deltas reassembled by array index.

There is deliberately **no fallback that synthesises an answer**. The embedding
layer degrades to a deterministic hash when Workers AI is absent, which is
correct there because a meaningless vector still exercises the isolation filter.
The same trick for chat would be indefensible: a fabricated reply is
indistinguishable, to the reader, from a real one. Unconfigured, both surfaces
say so.

**Both chat surfaces.** The Copilot at `/dashboard/ai` and the public Travel
Advisor at `/ai-platform/advisor`, sharing one turn loop â€” two loops would be
two chances to forget the untrusted-content wrapper or the per-turn tool ceiling.

**The Site Builder UI.** The whole Website area, with an editor whose preview is
the *real* renderer returned as HTML and framed with `sandbox=""`. A React
approximation would be wrong in precisely the cases that matter: escaping,
structured data, the attribution footer, and every section type nobody thought
to mirror.

**The dispatch Worker.** `cloudflare/website-platform/`, plus the signed routing
endpoint it resolves against.

**Super Admin V3 and x402.**

---

## Defects found and fixed

Four, all found by tests written for this work, none visible in review:

1. **Conversation messages sorted non-deterministically.** They were ordered by
   `created_at`, but the two halves of an exchange are written in one
   transaction and PostgreSQL's `now()` is transaction time â€” so both rows
   carried an identical timestamp and the assistant turn sorted before the
   question about half the time. The model would then read a transcript in which
   it spoke first. Fixed with an explicit `sequence` column, a unique index and
   a backfill (`20260812050000_ai_message_sequence`).

2. **CSP would have blanked the editor preview.** `frame-src` listed only
   Stripe. A `srcdoc` iframe is matched against `frame-src` using the embedding
   document's URL, so the preview needed `'self'` â€” and report-only mode would
   have hidden that until the day the policy was promoted to enforcing.

3. **"Temporary" feature grants were permanent.** `FeatureFlag` had no expiry, so
   the admin override the brief calls for could not actually end. Added
   `expires_at`, `reason` and `granted_by`; all three resolvers now treat an
   expired row as absent and fall through to the plan, and a CHECK constraint
   stops a plan-level row from ever carrying an expiry.

4. **Field help text was folding into accessible names.** Hints lived inside
   `<label>`, so a screen reader announced the entire hint on every focus and
   "Headline" was ambiguous with "Subheadline". Now `aria-describedby`, with ids
   namespaced per repeater item.

One more, recorded because it will recur: the e2e suite is close to the login
rate-limit ceiling. Ten attempts per IP per fifteen minutes, one address for the
whole run; adding a spec with a per-test login pushed it over and the later
tests failed at the sign-in form. The new spec logs in once for the file. Six of
ten are now spent.

---

## Blockers

Each is a verification that cannot be performed here, not a defect.

**B1 â€” No model provider has ever been called.** The provider layer is unit
-tested against a stubbed `fetch` covering framing, chunk-boundary splits, tool
-call reassembly, usage accounting, error classification and secret handling;
the turn loop is integration-tested through an injected invoker. What has not
been observed is a real provider's exact SSE dialect. **Resolve on staging:** set
one provider key, open the Copilot, confirm a streamed answer and a tool call,
confirm an `AiUsageEvent` row with non-zero tokens.

**B2 â€” No Cloudflare account.** Publishing, the dispatch namespace, custom
hostnames and Vectorize have never run against real infrastructure. Vectorize
filter semantics in particular are verified against our own implementation of
the filter, not Cloudflare's. **Resolve on staging:** publish one site, load it
on `*.tripistic.site`, roll it back, attach one custom hostname end to end.

**B3 â€” No performance or accessibility measurement.** The brief names LCP < 2.5s,
CLS < 0.1, INP < 200ms, Worker cold start < 100ms, and widths from 320 to 1440.
None has been measured. No Lighthouse run, no axe run. **Resolve on staging:**
Lighthouse against a published tenant site; axe against the dashboard and the
editor.

**B4 â€” CSP is still report-only and still allows `'unsafe-inline'` scripts.**
Correct for today â€” enforcing a first-draft CSP breaks Stripe silently â€” but it
is not the finished control. **Resolve:** one week of violation data, tighten,
then promote. Removing `'unsafe-inline'` needs nonce plumbing through the theme
bootstrap and is a separate change.

**B5 â€” No x402 facilitator exercised.** Verification is tested through an
injected client across accept, reject, unreachable, replay and concurrency. The
HTTP shape of `httpFacilitator` follows the documented contract and has not been
confirmed against a running facilitator. Lower severity than the others: x402 is
off by default and its routes 404 while disabled.

---

## Known limitations (not blockers)

- **AI site generation is not implemented.** `siteGenerationPrompt` and the
  registry it would constrain output to exist; no route calls them. The
  `site_ai_generation` catalogue flag has been turned **off on every plan** to
  match â€” the same treatment x402 got in the first pass. A catalogue flag
  describes what a plan includes, and the first person to notice a flag that
  describes nothing would be a customer who paid for it.
- Site-publish, site-generation and domain-verification rate-limit buckets are
  defined but not wired to their routes.
- Grants issued by x402 cannot be revoked from the admin UI; expiry and the use
  ceiling are the only limits.
- The Site Builder editor has no drag handle for reordering on touch devices â€”
  reordering there requires the properties panel. HTML5 drag-and-drop does not
  fire on touch.
- Cloudflare WAF rules are account configuration, not repository code.

---

## What a reviewer should check first

1. `lib/ai/chat.ts` â€” the turn loop, and the two ceilings on it.
2. `lib/ai/rag/retrieve.ts` â€” unchanged this pass, and still the place tenant
   isolation is actually enforced.
3. `lib/sites/schema.ts` â€” the closed section vocabulary, and the new `hidden`
   flag that drops content from the render rather than styling it away.
4. `lib/x402/verify.ts` â€” the ordering of the payment-row claim against the
   facilitator call.
5. `prisma/migrations/20260812060000_feature_flag_expiry` â€” the CHECK constraint,
   and the three resolvers that read it.
