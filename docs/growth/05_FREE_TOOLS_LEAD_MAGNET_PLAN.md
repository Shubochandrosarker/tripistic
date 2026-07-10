# Tripistic — Free Tools / Lead Magnet Plan

> Product-led SEO: each tool targets a searched query, delivers real value in <60 seconds, and converts via email-gated results/PDF + a contextual trial CTA. Calculators are pure client-side math (zero run cost, instant). LLM tools get rate limits + email gates. All live under `/tools/*` on the marketing site; none require the SaaS app.

| Priority | Tool | URL | Target keywords | What it does | Lead capture | Build effort |
|---:|---|---|---|---|---|---|
| 1 | **OTA Commission Calculator** | `/tools/ota-commission-calculator` | viator commission calculator, getyourguide commission rate, ota fees | Inputs: monthly bookings, avg price, OTA %, OTA share → yearly commission paid; compares vs flat Tripistic plan | Email to get PDF breakdown + "reduce OTA dependency" guide | XS (static calc) |
| 2 | **Direct Booking Revenue Loss Calculator** | `/tools/booking-fee-calculator` | fareharbor fees calculator, booking fee calculator, 6% booking fee cost | Inputs: direct revenue + current platform (preset fee models: FareHarbor 6%, Peek 6%, Rezdy 3%+sub, Bókun 1.5%+sub, Checkfront 3%+sub) → annual cost vs Tripistic flat | Email for full comparison PDF | XS |
| 3 | **Tour Website SEO Audit** | `/tools/tour-website-audit` | tour website seo audit, seo for tour operators | URL scan: title/meta/H1, schema presence (TouristTrip/Product/FAQ), booking CTA above fold, mobile viewport, page speed hint, review markup | Email required for full report (top 3 issues free) | M (fetch + heuristics) |
| 4 | **Google Things To Do Readiness Checker** | `/tools/google-things-to-do-checker` | google things to do for tour operators, list tours on google | Checklist quiz + URL heuristics → readiness score + gap list (GBP, schema, bookable link, policies) | Email for readiness report | S (quiz) + M (URL checks) |
| 5 | **Tour Page Schema Generator** | `/tools/tour-schema-generator` | tour schema markup, touristtrip schema generator | Form (tour name, price, duration, location, FAQs) → valid JSON-LD to paste; validates basics | Soft gate: copy free, email to save/send | S |
| 6 | **AI Review Reply Generator** | `/tools/review-reply-generator` | review reply generator for tour operators, respond to tripadvisor review | Paste review + tone → 3 reply drafts (LLM, rate-limited) | Email after 1 free generation | S (LLM template) |
| 7 | **AI Tour Description Generator** | `/tools/tour-description-generator` | tour description generator, write tour description | Inputs (type, city, duration, highlights, audience) → description + meta title/description + FAQ block | Email after 1 free generation | S (LLM template) |
| 8 | **Booking Page Conversion Checker** | `/tools/booking-conversion-checker` | booking page conversion, why is my tour page not converting | Guided checklist (fees shown late? mobile? trust signals? calendar friction?) → scored report | Email for report + fixes guide | S |

## Funnel wiring

1. Tool result page always shows: (a) the number that hurts (e.g., "You paid ≈ $7,200 in booking fees last year"), (b) the Tripistic contrast line ("Flat $69/mo, 0% direct commission"), (c) one CTA: **Start free trial** or **Request free migration**.
2. Email capture → tag by tool → segmented drip (fee-pain drip vs SEO/growth drip) → migration offer at day 3–5.
3. Each tool cross-links its sibling guide (calculator ↔ "how to reduce OTA dependency" guide) to build the topical cluster.
4. Tools are citable assets for AEO — publish methodology + date on-page.

## Build order & ownership

- **Sprint 1 (with first alternative pages):** #1, #2 — they power the fee-math boxes on every alternative page.
- **Sprint 2:** #5, #8 (static), #4 quiz version.
- **Sprint 3:** #3 URL audit, #6, #7 (LLM, needs provider key + abuse limits).
- Guardrails: LLM tools use fixed prompts server-side, per-IP/email rate limits, no user text stored beyond the session without consent (GDPR posture from `docs/07`).

## KPIs

Per tool: sessions → completions → emails → trials → paying. North star: **cost-free lead volume feeding the migration offer**. Kill or rewrite any tool below 15% completion→email after 60 days.
