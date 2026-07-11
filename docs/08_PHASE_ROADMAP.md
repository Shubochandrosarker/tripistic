# Tripistic — Phase Roadmap

Build order follows the Master Prompt. Each phase ends with a working build, updated docs, and an explicit gate. **Do not start the next phase before the gate passes and the owner approves.**

| Phase | Name | Builds | Gate |
|---|---|---|---|
| **0** | Business & product analysis | `docs/00–08` (this pack) | Docs reviewed — **done** |
| **1** | **SaaS Foundation** | Auth (register/login/logout, protected routes) · workspaces + members + invitations · roles/permissions · dashboard shell + all `/dashboard/*` pages (premium empty states) · admin shell + `/admin/*` · plans/subscriptions/feature-flags foundation (seeded, no Stripe) · audit logging · settings · `.env.example` · migrations + seed · implementation plan + completion report | Register → create workspace → role-gated dashboard works; tenant isolation verified; `npm run build` clean — **done** (`docs/10_PHASE_1_COMPLETION_REPORT.md`) |
| **2** | Tours & availability | Tour CRUD, packages structure, availability/capacity/schedule/blackouts, pricing fields, add-ons, policies, media placeholders | Operator defines bookable product with future slots — **done** (`docs/12_PHASE_2_COMPLETION_REPORT.md`) |
| **2.1** | **Hardening gate (mandatory before public booking)** | Strict date/timezone validation, transaction-safe schedule creation, canonical archive service, query validation, DB-level capacity `CHECK` constraints, composite tenant-safe FKs for the new booking subtree, Vitest+Playwright+CI foundation, dependency pinning | Gate approved before any Phase 3 code that exposes booking to the public — **done, approved** (`docs/13_PHASE_2_1_HARDENING_PLAN.md`, `docs/15_PHASE_2_1_HARDENING_REPORT.md`) |
| **3** | Booking engine MVP | Public booking page/widget foundation, calendar, guest/participant forms, booking statuses, manual booking, confirmation, bookings dashboard, embed/iframe foundation | End-to-end booking decrements capacity atomically — **done**, proven under real Postgres concurrency (`docs/14_PHASE_3_IMPLEMENTATION_PLAN.md`, `docs/16_PHASE_3_COMPLETION_REPORT.md`) |
| **4** | Stripe payments ← current (complete, stopped here per instruction) | Stripe Checkout Sessions, signed webhooks, payment status automation (`pending`→`confirmed` only on verified payment), unpaid-booking expiration + capacity release, manual-booking payment links, dashboard payment status | Paid booking reconciles via webhook — **done**, atomic payment-confirms-booking transition and idempotent webhook processing proven under real Postgres concurrency (`docs/17_PHASE_4_IMPLEMENTATION_PLAN.md`, `docs/18_PHASE_4_COMPLETION_REPORT.md`) |
| 5 | CRM & communication | Customer profiles/history/notes/tags/consent, email templates, confirmation + reminder automation, review-request foundation | Confirmation email sends; consent respected |
| 6 | Guides/staff & waivers | Guide profiles/assignment, daily manifest, guide mobile view, waiver templates/versions/signatures | Guide sees only assigned departures; signed waiver attached |
| 7 | AI Growth Dashboard MVP | Insight data model, rules-based engine, priority scoring, statuses, dashboard widgets, LLM narration behind abstraction | Insights generate with **no** AI key configured |
| 8 | AI booking agent foundation | Knowledge base structure, Q&A source mapping, availability guardrails, conversation logs, human handoff | Agent never answers outside verified data |
| 9 | OTA/channel sync foundation | Channel connections, listing mapping, sync queue, import/export, Viator/GYG/Google TTD placeholders | Inventory maps + queue processes |
| 10 | SaaS billing & plans | Stripe subscriptions, trials, feature limits enforcement, usage/AI-credit tracking | Self-serve upgrade/downgrade works |
| 11 | Production hardening | Security review, isolation tests, rate limiting, error boundaries, logging, backups, deployment docs, compliance checklist | Launch checklist green |

## Business gates (parallel)

| Milestone | Threshold |
|---|---|
| Validation | 20+ serious beta leads |
| Paid beta | 20+ paying operators |
| PMF signal | 100+ paying operators, <5% monthly churn |
| AI proof | Measurable booking/revenue/no-show improvement |

## Standing rules

1. Never fake unfinished modules — premium empty states name their phase.
2. Every phase preserves tenant isolation and audit coverage.
3. Rules-based AI before paid inference (Phase 7 rule).
4. Stop after each phase's completion report; owner approves the next phase.
