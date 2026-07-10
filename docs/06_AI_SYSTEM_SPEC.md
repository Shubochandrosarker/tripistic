# Tripistic — AI System Spec

> Phase 1 ships **no AI calls** — only placeholders, env keys, feature flags, and this design. First real AI ships in Phase 7 (AI Growth Dashboard), then Phase 8 (booking agent).

## 1. Principles

1. **Rules before models.** Every AI surface must work with deterministic rules + template copy when no AI key is configured. LLMs narrate and prioritize; they do not invent data.
2. **Verified data only.** AI reads from workspace-scoped system data (bookings, revenue, availability, policies). It must never invent availability, prices, discounts, refund policies, pickup details, or legal/safety claims.
3. **Tenant-scoped context.** Every AI request carries exactly one `workspace_id` scope; cross-tenant context mixing is forbidden.
4. **Human control.** Sensitive actions (pricing changes, guest-facing promises) require operator approval. Handoff to human is always available.
5. **Observable.** Every AI request/response is logged (workspace, feature, model, tokens, latency, validation result).

## 2. Architecture

```text
App feature → AI Gateway (lib/ai) → Provider Adapter (OpenAI | OpenRouter | Anthropic | mock)
            → Model → Output Validator (zod schema per feature) → App action / stored insight
```

- **Provider abstraction:** `AI_GATEWAY_URL` optional proxy; `AI_MODEL_DEFAULT` names default model; adapters selected by configured keys (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`). A `mock` adapter returns deterministic fixtures for dev/tests.
- **Prompt templates** are versioned files with a system-rules preamble per feature; user data injected as structured JSON, never string-concatenated instructions from untrusted sources without labeling.
- **Validation:** model output must parse against the feature's zod schema (e.g., insight card schema); otherwise fall back to rules-generated content and log the failure.
- **Controls:** per-workspace rate limits + monthly AI-credit limits (`plans.limits.ai_credits_monthly`, `feature_flags.ai_growth_dashboard`), confidence thresholds, kill-switch flag per feature.

## 3. Feature specs

### 3.1 AI Growth Dashboard (Phase 7 — first AI)
- **Inputs:** workspace bookings, revenue, occupancy, product performance, channel/source, cancellations/no-shows.
- **v1 pipeline:** nightly (or on-demand) rules engine computes candidate insights (weekday occupancy gaps, underperforming products, direct-share below target, sell-out patterns) → scores priority/expected impact → optional LLM pass rewrites each insight into plain-English recommendation text.
- **Insight record:** type, title, summary, recommendation, priority_score, expected_impact, confidence, status (`new/accepted/dismissed/completed`), source_data snapshot.
- **Guardrail:** numbers in copy must come from `source_data`, not the model.

### 3.2 AI Booking Agent (Phase 8)
- Knowledge sources: tours, availability, policies, FAQs — retrieval-only; payment-link handoff; conversation logs; human handoff; multilingual.
- Hard refusals: anything outside verified data (availability, discounts, refunds, legal/safety, pickup specifics).

### 3.3 Later: demand forecasting (heuristics → ML), itinerary builder, no-show prediction, marketing assistant, transparent pricing suggestions (operator approval + floors/caps), agent-commerce APIs (clean product/availability/pricing endpoints + JSON-LD; MCP bridge later).

## 4. Risk controls summary

| Risk | Control |
|---|---|
| Hallucinated business facts | retrieval-only context, schema validation, numeric provenance from source_data |
| Cross-tenant leakage | workspace-scoped context assembly in gateway; tests |
| Cost blowout | credit limits per plan, caching, rules-first design |
| Prompt injection (guest-facing) | instruction/data separation, output validation, no tool powers beyond read + payment-link creation |
| Provider outage | adapter fallback + rules fallback |
| Trust/backlash (pricing) | suggestions only, approval, floors/caps, plain explanations |

## 5. Phase 1 deliverables (this build)

- `/dashboard/ai-growth` premium placeholder page + `AIRecommendationCard` placeholder component (clearly labeled example, no fake live data).
- Env placeholders: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_URL`, `AI_MODEL_DEFAULT`.
- `feature_flags` seeded: `ai_growth_dashboard` enabled at plan defaults (operator+), disabled for solo basic insights tier decision later.
- No `lib/ai` runtime code yet — first written in Phase 7 against this spec.
