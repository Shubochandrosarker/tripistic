# Tripistic

**AI-native tour operations platform** for independent guides and small tour operators — bookings, payments, guides, waivers, guest communication, AI itineraries, operations, and enterprise administration in one dashboard, with **0% commission on direct bookings**.

> **Status: v2.0.0 enterprise foundation.** Tripistic now includes the original booking, payment, CRM, guide/waiver, operations, fleet, vendor, AI itinerary, and AI growth modules, plus the v2 foundation for theme modes, global command/search, super-admin revenue/license/health pages, white-label records, custom-domain records, AI provider configuration, and maintenance mode. See [`docs/CHANGELOG-v2.0.0.md`](docs/CHANGELOG-v2.0.0.md).

## Stack

- **Next.js 15** (App Router) · **TypeScript** · **Tailwind CSS v4**
- **PostgreSQL** + **Prisma 6** (shared DB, `workspace_id` tenant isolation; composite tenant-safe foreign keys on the booking and payment tables)
- **Auth.js / NextAuth v5** (credentials + JWT sessions, bcrypt)
- **Stripe** (Checkout Sessions, signed webhooks) · **zod** validation · **lucide** icons · **Geist** type
- **Vitest** (unit + PostgreSQL-backed integration tests) · **Playwright** (critical booking flow) · **GitHub Actions** CI

## Getting started

```bash
# 1. Install (runs `prisma generate` automatically)
npm install

# 2. Configure environment
cp .env.example .env
#    → set DATABASE_URL (PostgreSQL) and AUTH_SECRET (openssl rand -base64 32)
#    → optionally set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD to create a platform admin

# 3. Migrate + seed (4 plans + plan feature flags + optional platform admin)
npm run db:migrate        # prisma migrate deploy
npm run db:seed

# 4. Run
npm run dev               # http://localhost:3000
```

Register at `/register`, create your workspace, and you land on the dashboard. A user whose `SEED_ADMIN_*` account was seeded can also open `/admin`. Create a tour, set it **active** + **public**, add a schedule, then open the **Share your booking page** panel on the tour detail page for the public link and embed snippet.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop / production build / serve |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm run db:migrate` · `db:migrate:dev` | Apply migrations (deploy / dev) |
| `npm run db:seed` · `db:studio` | Seed plans & flags · Prisma Studio |
| `npm test` / `test:unit` | Pure-function unit tests (Vitest, no DB) |
| `npm run test:integration` | PostgreSQL-backed integration tests against `tripistic_test` (migrates it first) |
| `npm run test:e2e` | Playwright critical booking flow against a production build + seeded `tripistic_test` |
| `npm run test:ci` | generate → validate → lint → typecheck → unit → integration → build, in sequence |

Integration/e2e tests run against a **separate** `tripistic_test` database — set `DATABASE_URL` in a local (gitignored) `.env.test`, or rely on the equivalent variables the CI workflow sets directly. See [`docs/13_PHASE_2_1_HARDENING_PLAN.md`](docs/13_PHASE_2_1_HARDENING_PLAN.md) §3.9 and [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Project structure

```text
app/            routes: landing, auth, /dashboard/*, /admin/*, /api/*, and the public
                /book/*, /embed/*, /api/public/* booking surface
components/     app shell, ui kit, dashboard/settings/auth/tours/bookings/booking components
lib/            auth (session, guards, permissions), tenancy (incl. public), audit, plans,
                validation, tours/*, bookings/* (canonical service, status machine, serializers)
prisma/         schema, migrations, seed (+ seed-e2e.ts for the Playwright fixture)
tests/          unit/ (no DB) · integration/ (PostgreSQL) · e2e/ (Playwright)
scripts/        test-integration.sh · test-e2e.sh
docs/           00–16 business analysis, PRDs, phase plans/reports · growth/ SEO research
```

Strategy source documents (business plan, product system, roadmap, etc.) live at the repo root as `00_README.md` … `11_Execution_Checklist.md`.

## Multi-tenancy & security model

- Every tenant record carries `workspace_id`; every internal query is scoped through verified membership (`lib/tenancy/workspace.ts`) — never client-supplied ids. Public booking routes resolve tenancy by verified workspace **slug** (`lib/tenancy/public.ts`), never a client-supplied workspace ID, and only ever expose `active` workspaces / `active` + `public` tours / future `scheduled` departures.
- Roles: `platform_admin` (platform) + `workspace_owner / workspace_admin / guide / staff / viewer` (per workspace), enforced server-side with last-owner protection. Booking capabilities: owner/admin/staff manage bookings with full guest PII; viewer gets a redacted read-only summary; guide has no general booking access until Phase 6 manifests.
- `/dashboard/**` requires a session; `/admin/**` requires a **database-verified** platform admin (404 otherwise). `/book/**` and `/embed/**` are intentionally public (outside the auth middleware matcher).
- **Booking capacity is reserved atomically at the PostgreSQL level** — a single parameterized `UPDATE ... WHERE booked_count + seats <= capacity RETURNING id` inside a transaction, never a read-then-write. CHECK constraints (`capacity > 0`, `0 <= booked_count <= capacity`) enforce the same invariant at the database level regardless of application code. Proven under real concurrent load in `tests/integration/booking-concurrency.test.ts`.
- Public booking creation is idempotent (client-supplied UUID key, unique per workspace) and honeypot-protected; the confirmation page is `noindex` and resolved only by a high-entropy token, never a sequential ID.
- Sensitive actions append to `audit_logs` (actor, workspace, action, entity, safe metadata only — never guest email/phone/notes, IP, user agent).
- Secrets come from environment only — see [`.env.example`](.env.example). The app boots with all optional integrations (Stripe, SMTP, AI, storage) unset.
- **Rate limiting is intentionally not implemented in-app** (an unreliable in-memory limiter would not survive multiple server instances and would misrepresent production safety). For production, put the public booking surface (`POST /api/public/[workspaceSlug]/bookings` especially) behind a WAF/CDN rate limit — e.g. a Cloudflare rate-limiting rule of roughly 20–30 requests/minute per IP on `POST /api/public/*`, tighter on the booking-creation path specifically, with a stricter burst rule on repeated 4xx/409 responses. Full abuse-control infrastructure is scoped to Phase 11.


## V3 — Cloudflare platform expansion

Version 3 adds an edge platform layer on top of the v2 application. Tripistic
Core stays on Hostinger and PostgreSQL remains the only system of record;
Cloudflare stores derived state only.

| Capability | State | Docs |
|---|---|---|
| Cloudflare integration layer, per-capability detection | shipped | [CLOUDFLARE.md](docs/v3/CLOUDFLARE.md) |
| Signed Worker↔Core auth with replay protection | shipped | [CLOUDFLARE.md](docs/v3/CLOUDFLARE.md) |
| Site Builder content model, templates, renderer, publish | backend shipped, editor not built | [SITE_BUILDER.md](docs/v3/SITE_BUILDER.md) |
| Workers for Platforms deployment and rollback | user Workers shipped; dispatch Worker external | [WORKERS_FOR_PLATFORMS.md](docs/v3/WORKERS_FOR_PLATFORMS.md) |
| Custom domain → site binding | shipped | [CUSTOM_DOMAINS.md](docs/v3/CUSTOM_DOMAINS.md) |
| AI tasks, metering, permission-aware tools, safety | shipped | [AI_ARCHITECTURE.md](docs/v3/AI_ARCHITECTURE.md) |
| RAG with enforced tenant isolation | shipped | [RAG.md](docs/v3/RAG.md) |
| AI chat surfaces (public advisor, copilot) | not built | [FINAL_QA_REPORT.md](docs/v3/FINAL_QA_REPORT.md) |
| x402 machine payments | not implemented | [X402.md](docs/v3/X402.md) |

**Every Cloudflare capability is optional.** With no Cloudflare account the
application boots unchanged, every pre-V3 route works, and the admin health view
reports each service as Not Configured rather than as a failure.

Start with the [Phase 0 audit](docs/v3/CURRENT_STATE_AUDIT.md) for what the
codebase actually contained, and the
[final QA report](docs/v3/FINAL_QA_REPORT.md) for what shipped, what did not,
and why the release is marked NOT READY FOR PRODUCTION.

Environment variables: [ENVIRONMENT.md](docs/v3/ENVIRONMENT.md).
Deployment: [STAGING_DEPLOYMENT.md](docs/v3/STAGING_DEPLOYMENT.md) →
[PRODUCTION_DEPLOYMENT.md](docs/v3/PRODUCTION_DEPLOYMENT.md) →
[ROLLBACK.md](docs/v3/ROLLBACK.md).

## Documentation

| Doc | Contents |
|---|---|
| [`docs/00_BUSINESS_ANALYSIS_REPORT.md`](docs/00_BUSINESS_ANALYSIS_REPORT.md) | Market, segments, pain map, competitor gaps, pricing, AI strategy, risks |
| [`docs/01–07`](docs) | PRD, MVP spec, data model, API spec, auth/tenancy, AI system, compliance |
| [`docs/08_PHASE_ROADMAP.md`](docs/08_PHASE_ROADMAP.md) | Build phases 0–11 with gates |
| [`docs/09`](docs/09_PHASE_1_IMPLEMENTATION_PLAN.md) / [`docs/10`](docs/10_PHASE_1_COMPLETION_REPORT.md) | Phase 1 plan + completion report |
| [`docs/11`](docs/11_PHASE_2_IMPLEMENTATION_PLAN.md) / [`docs/12`](docs/12_PHASE_2_COMPLETION_REPORT.md) | Phase 2 plan + completion report (tours & availability) |
| [`docs/13`](docs/13_PHASE_2_1_HARDENING_PLAN.md) / [`docs/15`](docs/15_PHASE_2_1_HARDENING_REPORT.md) | Phase 2.1 hardening plan + completion report |
| [`docs/14`](docs/14_PHASE_3_IMPLEMENTATION_PLAN.md) / [`docs/16`](docs/16_PHASE_3_COMPLETION_REPORT.md) | Phase 3 plan + completion report (booking engine) |
| [`docs/17`](docs/17_PHASE_4_IMPLEMENTATION_PLAN.md) / [`docs/18`](docs/18_PHASE_4_COMPLETION_REPORT.md) | Phase 4 plan + completion report (Stripe payments) |
| [`docs/growth/`](docs/growth) | USA/UK/EU market research, SEO keyword strategy, competitor pages, AI demand analysis, free-tools plan, growth roadmap |
| [`docs/AUDIT.md`](docs/AUDIT.md) | v2 repository audit across architecture, database, auth, RBAC, tenancy, APIs, Stripe, performance, security, and tests |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | v2 architecture and runtime model |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) | v2 migration and rollout guide |
| [`docs/UI-SYSTEM.md`](docs/UI-SYSTEM.md) | v2 theme, shell, and command palette system |
| [`docs/SUPER-ADMIN.md`](docs/SUPER-ADMIN.md) | v2 super-admin portal |
| [`docs/WHITE-LABEL.md`](docs/WHITE-LABEL.md) | white-label model and rollout requirements |
| [`docs/CUSTOM-DOMAINS.md`](docs/CUSTOM-DOMAINS.md) | custom-domain model, DNS, SSL, and resolver plan |
| [`docs/CHANGELOG-v2.0.0.md`](docs/CHANGELOG-v2.0.0.md) | v2.0.0 changes and known follow-up |

## License

See [LICENSE](LICENSE).
