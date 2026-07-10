# Tripistic

**AI-native tour operations platform** for independent guides and small tour operators — bookings, payments, guides, waivers, guest communication, and AI growth insights in one dashboard, with **0% commission on direct bookings**.

> **Status: Phase 1 (SaaS Foundation) complete.** Multi-tenant accounts, auth, workspaces, roles, dashboard + admin shells, plans/subscriptions/feature-flags foundation, and audit logging are live. Tours, bookings, payments, and AI modules ship in Phases 2–11 — see [`docs/08_PHASE_ROADMAP.md`](docs/08_PHASE_ROADMAP.md).

## Stack

- **Next.js 15** (App Router) · **TypeScript** · **Tailwind CSS v4**
- **PostgreSQL** + **Prisma 6** (shared DB, `workspace_id` tenant isolation)
- **Auth.js / NextAuth v5** (credentials + JWT sessions, bcrypt)
- **zod** validation · **lucide** icons · **Geist** type

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

Register at `/register`, create your workspace, and you land on the dashboard. A user whose `SEED_ADMIN_*` account was seeded can also open `/admin`.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Develop / production build / serve |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm run db:migrate` · `db:migrate:dev` | Apply migrations (deploy / dev) |
| `npm run db:seed` · `db:studio` | Seed plans & flags · Prisma Studio |

## Project structure

```text
app/            routes: landing, auth, /dashboard/*, /admin/*, /api/*
components/     app shell, ui kit, dashboard/settings/auth components
lib/            auth (session, guards, permissions), tenancy, audit, plans, validation
prisma/         schema, migrations, seed
docs/           00–10 business analysis, PRDs, phase plans/reports · growth/ SEO research
```

Strategy source documents (business plan, product system, roadmap, etc.) live at the repo root as `00_README.md` … `11_Execution_Checklist.md`.

## Multi-tenancy & security model (Phase 1)

- Every tenant record carries `workspace_id`; every query is scoped through verified membership (`lib/tenancy/workspace.ts`) — never client-supplied ids.
- Roles: `platform_admin` (platform) + `workspace_owner / workspace_admin / guide / staff / viewer` (per workspace), enforced server-side with last-owner protection.
- `/dashboard/**` requires a session; `/admin/**` requires a **database-verified** platform admin (404 otherwise).
- Sensitive actions append to `audit_logs` (actor, workspace, action, entity, metadata, IP, user agent).
- Secrets come from environment only — see [`.env.example`](.env.example). The app boots with all optional integrations (Stripe, SMTP, AI, storage) unset.

## Documentation

| Doc | Contents |
|---|---|
| [`docs/00_BUSINESS_ANALYSIS_REPORT.md`](docs/00_BUSINESS_ANALYSIS_REPORT.md) | Market, segments, pain map, competitor gaps, pricing, AI strategy, risks |
| [`docs/01–07`](docs) | PRD, MVP spec, data model, API spec, auth/tenancy, AI system, compliance |
| [`docs/08_PHASE_ROADMAP.md`](docs/08_PHASE_ROADMAP.md) | Build phases 0–11 with gates |
| [`docs/09_PHASE_1_IMPLEMENTATION_PLAN.md`](docs/09_PHASE_1_IMPLEMENTATION_PLAN.md) | Phase 1 workflow (written before coding) |
| [`docs/10_PHASE_1_COMPLETION_REPORT.md`](docs/10_PHASE_1_COMPLETION_REPORT.md) | What shipped, testing results, known gaps |
| [`docs/growth/`](docs/growth) | USA/UK/EU market research, SEO keyword strategy, competitor pages, AI demand analysis, free-tools plan, growth roadmap |

## License

See [LICENSE](LICENSE).
