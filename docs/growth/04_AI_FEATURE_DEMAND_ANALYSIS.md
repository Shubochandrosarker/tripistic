# Tripistic — AI Feature Demand Analysis

> Scoring: 1–5 (5 = best). **Demand** = evidence operators want/pay for it; **Difficulty** = build cost incl. data needs & safety (5 = easiest); **Revenue impact** = effect on operator revenue → our retention/pricing power; **SEO value** = keyword surface + free-tool potential. Ranked by MVP priority. Consistent with `docs/06_AI_SYSTEM_SPEC.md` (rules-first, verified data only).

| # | Feature | Demand | Difficulty (ease) | Revenue impact | SEO value | MVP priority |
|---:|---|:---:|:---:|:---:|:---:|---|
| 1 | **AI Growth Dashboard** (prescriptive insights) | 4 | 4 (rules first + LLM narration) | 5 | 4 | **P0 — flagship, Phase 7.** Uncontested white space; analytics is most profit-correlated, least served. Works without model calls. |
| 2 | **AI tour page generator** (descriptions, SEO/schema-ready pages) | 4 | 5 (pure LLM + templates) | 3 | **5** | **P0-adjacent — ship as free tool first** (lead magnet), then in-product at Phase 2 (tour creation assist). Cheap, demoable, huge keyword surface. |
| 3 | **AI review reply generator** | 4 | 5 | 3 | **5** | **P1 — free tool now**, in-product at Phase 5. Reviews drive OTA ranking + local SEO; daily-use habit builder. |
| 4 | **AI reminder/message generator** (confirmations, pickup, weather) | 4 | 4 | 4 (no-show reduction) | 3 | P1 — ships with Phase 5 communication as template-assist. Transactional safety: operator approves templates. |
| 5 | **AI booking assistant** (multilingual guest agent) | 5 | 2 (live-inventory binding, hallucination guardrails, channels) | 5 | 4 | P2 — Phase 8 per roadmap. Contested (FareHarbor Agent, third parties) but native+affordable for SMBs still open. Needs booking backbone first. |
| 6 | **AI translation/multilingual content** | 4 (EU strong) | 4 | 3 | 4 (EU keywords) | P2 — ride along with Phase 5 comms (guest-language templates) and tour pages. EU differentiator; low risk if human-reviewable. |
| 7 | **AI itinerary builder** | 3–4 (multi-day/private niche) | 3 | 4 | 4 (uncontested keyword) | P2 — Phase 8+. No incumbent ships it natively; needs product catalog (Phase 2) to be useful. |
| 8 | **AI demand forecasting** | 4 | 2 (needs seasons of booking history; cold-start) | 4 | 3 | P3 — heuristic version inside Growth Dashboard first ("Saturdays outsell weekdays 72%"), true forecasting after data accrues. |
| 9 | **AI no-show prediction** | 3 | 2 (needs outcome history + labels) | 4 | 2 | P3 — clear ROI story but data-hungry; start with rule flags (unpaid + unsigned waiver + no reminder click). |
| 10 | **AI dynamic pricing** | 3 (operators wary; Peek owns the claim) | 2 | 4 | 3 | P4 — **suggestions only**, operator approval, floors/caps, transparent reasoning. Never lead marketing with it; backlash risk documented. |

## Sequencing logic

1. **Phase now (marketing, zero product risk):** #2 and #3 as **free tools** — they generate leads and teach the market that Tripistic = AI for tour operators, before the AI is even in-product.
2. **Phase 7 (first in-product AI):** #1 Growth Dashboard — rules engine + template copy, LLM narration optional. This is the differentiator every strategy doc agrees on.
3. **Phase 5 rides along:** #4 message assist + #6 translation inside communication templates.
4. **Phase 8:** #5 booking agent (needs Phases 2–4 live inventory), #7 itinerary builder.
5. **Data-gated (12+ months of bookings):** #8 forecasting, #9 no-show prediction, #10 pricing suggestions.

## Honesty constraints (from competitive research)

- Peek Pro already ships AI dynamic pricing (documented 5–15% lift claims) and FareHarbor ships a native guest agent — **never market #5/#10 as industry-firsts**.
- Genuine first-mover claims available: prescriptive growth dashboard for SMBs, itinerary builder, no-show prediction, guide-scheduling optimization, agent-commerce readiness.
- Every AI feature must degrade gracefully to rules/templates when no AI key/credits — this is both an architecture rule and a trust story ("no AI tax to run your business").
