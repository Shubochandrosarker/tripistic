# Tripistic AI Architecture

## Layers

```
surface (public advisor | workspace copilot | contextual | system)
   ↓
lib/ai/tasks.ts        task → model preference, token caps, timeout, credit cost
   ↓
lib/ai/usage.ts        assertCredits → call → recordUsageEvent → consumeCredits
   ↓
provider               Workers AI | OpenAI | OpenRouter, via AI Gateway when set
   ↓
lib/ai/tools.ts        permission-aware tools; every call re-authorised server-side
lib/ai/rag/*           retrieval, filtered by tenant before the model sees anything
lib/ai/safety.ts       untrusted-content delimiting, injection scan, output checks
```

## Tasks, not models

Features name a task (`rag_answer`, `website_generation`, `classification`),
never a model string. Each task carries a preference order, an input cap, an
output cap, a timeout, a temperature and a credit cost. Binding a feature to a
model means a provider change is a search-and-replace, which is how a
deprecated model ends up still being called from one forgotten place.

Workers AI leads the cheap high-volume tasks: closest to the edge, no
third-party key, available to any deployment with a Cloudflare account. Hosted
frontier models lead where quality decides whether the feature is worth
shipping — nobody wants an operator's homepage written by the cheapest model.

## Metering

`ai_credits_monthly` existed in every plan since the public-launch catalogue and
decremented nothing. V3 turns it on, carefully:

- checked **before** the call — a limit enforced afterwards is a bill;
- an 80% warning in the response, so 100% is not a surprise;
- a per-workspace admin override via the existing `FeatureFlag` mechanism, so
  hitting the ceiling mid-season is a support conversation and not an outage;
- `-1` honoured, so Enterprise is unaffected;
- incremented with an atomic upsert, so two concurrent calls cannot both read 99.

Cost is tracked in integer **millicents**. A per-call cost of $0.0003 in a float
accumulates a visibly wrong number over a month. Prices are labelled estimates
everywhere they surface and are never used for anything a customer is billed
from.

Failed calls are recorded too. A month where 40% of calls errored is the most
useful fact about an AI feature, and a table holding only successes cannot say
so.

## AI Gateway

Routed through the gateway when configured, for analytics, retries and cost
attribution. **Caching is on only for the public marketing chat.** Cloudflare's
own guidance warns that a RAG/indexing gateway needs care with caching and rate
limiting; a cached embedding keyed on text alone would be shared across tenants,
and a gateway rate limit would throttle a bulk reindex into failure rather than
queueing it. `cf-aig-metadata` carries ids and enum labels only — no prompt
text, no customer names.

Without a gateway, calls go direct to the provider. Losing analytics is a
degradation; losing the features is not acceptable for a deployment that has
provider keys but no Cloudflare account.

## Tool layer

A tool call is an ordinary authenticated request that happens to have been
proposed by a model. It passes through `requireWorkspaceAccess`, the same
`canManage*` predicates, and `hasFeature`.

- **No tool takes a `workspaceId` or `userId` argument** — both come from the
  verified session, so a model cannot be talked into changing them.
- **No tool composes a query.** Every one is a fixed Prisma call with validated
  arguments and an explicit `select`.
- **Guest PII is absent from tool results.** Answering "how many bookings
  tomorrow" does not need it, and anything a tool returns is sent to a provider.
- **Writes return proposals, not mutations.** Acceptance calls the ordinary
  route that already exists, with its own guard and audit entry — so there is no
  second write path with weaker checks.
- **The strong-confirm class has no tool at all.** Publishing, cancelling a
  booking, issuing a refund, changing a subscription, removing a domain: absent
  rather than flagged. That is the implementation of "the LLM cannot bypass
  confirmation".

## Not implemented in this release

The chat surfaces themselves — `/ai`, `/dashboard/ai`, the floating marketing
assistant, conversation UI, and the provider call loop that turns a task profile
into an HTTP request. The infrastructure they need (routing, metering, tools,
retrieval, safety, conversation schema) is built and tested. See
`docs/v3/FINAL_QA_REPORT.md`.
