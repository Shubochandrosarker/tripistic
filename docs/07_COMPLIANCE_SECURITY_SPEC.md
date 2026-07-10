# Tripistic — Compliance & Security Spec

## 1. Scope by phase

| Phase | Compliance/security work |
|---|---|
| 1 (now) | Auth, RBAC, tenant isolation, audit logs, env-only secrets, input validation, safe errors, soft deletes |
| 4 | PCI scope minimization (Stripe-hosted), webhook signature verification |
| 5 | Messaging consent, opt-out, transactional/marketing separation |
| 6 | Waiver evidence (immutable versions, signature + timestamp + IP + UA) |
| 7–8 | AI guardrails per `06_AI_SYSTEM_SPEC.md` |
| 11 | Rate limiting, backups, incident response, RLS evaluation, pen-test checklist, SOC 2 direction |

## 2. Payments & PCI-DSS

- Stripe Checkout / Payment Element only; store only Stripe customer/payment/subscription IDs.
- **Never store raw card numbers** (no PAN, CVV, expiry anywhere — DB, logs, or analytics).
- Verify Stripe webhook signatures (`STRIPE_WEBHOOK_SECRET`); reject unsigned/invalid.
- HTTPS everywhere; secrets in env only. Target PCI scope: SAQ-A.

## 3. GDPR / UK GDPR / CCPA-CPRA

- Lawful basis + consent tracking on customer records (`consent_status` from Phase 5).
- Data subject rights: export + deletion workflows (deletion = hard delete/anonymization path over soft-delete records); document SLA.
- Retention settings per workspace (settings store is ready); marketing opt-in/out; cookie consent on public widgets (Phase 3).
- DPA readiness for operator customers; do not sell personal data.

## 4. Digital waivers (Phase 6 rules, fixed now)

- Waiver text versions are **immutable**; edits create new versions.
- Signature record stores: signed document snapshot/version ref, name, signature, timestamp, IP, user agent, booking + participant ids.
- Marketing language: Tripistic *helps collect and store* waivers; **never** claim guaranteed legal enforceability.

## 5. Application security controls (Phase 1 implementation)

| Control | Implementation |
|---|---|
| Password storage | bcrypt (cost 12), no plaintext anywhere |
| Session | NextAuth JWT in httpOnly, sameSite=lax cookies; `AUTH_SECRET` from env |
| Route protection | middleware + server-layout guards + per-API `requireUser` |
| RBAC | capability checks (owner/admin/billing rules) enforced server-side; admin verified against DB |
| Tenant isolation | `lib/tenancy` helpers; every tenant query scoped by verified membership; 404 for out-of-tenant resources |
| Input validation | zod schemas on all mutating endpoints; allow-listed settings keys; enum-validated roles |
| Output safety | generic error bodies; server-side logging; no stack traces to clients |
| Audit trail | append-only `audit_logs` via helper (IP + UA captured); sensitive actions listed in `05` §5 |
| Secrets | `.env.example` placeholders only; app boots with optional integrations unset |
| Last-owner protection | role change/removal guarded |
| Invitation tokens | 32-byte random, unique, 7-day expiry, single-use |
| Soft deletes | `deleted_at` on users/workspaces (+ future business tables); excluded from queries |

## 6. Later hardening backlog (tracked, not Phase 1)

- Rate limiting (auth + public endpoints), MFA, email verification enforcement, password reset flow, session revocation list.
- Postgres RLS as belt-and-braces under app-layer scoping.
- Backup/restore runbook, log retention policy, incident response plan.
- Dependency/security scanning in CI; secret scanning; SOC 2 Type II preparation.
- File upload security (when media ships), signed URLs for storage.

## 7. Risk register (top)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cross-tenant data exposure | Low (with helpers) | Critical | single-path tenancy helpers, isolation tests, RLS later |
| Credential stuffing | Medium | High | bcrypt, rate limiting (P11), MFA (later) |
| Webhook forgery | Medium (P4+) | High | signature verification, idempotency |
| AI hallucination liability | Medium (P7+) | High | retrieval-only + validation + approval |
| Secret leakage | Low | Critical | env-only, `.gitignore`, no secrets in logs/seed |
| Under-audited admin actions | Low | Medium | audit `admin_action` on every admin mutation |
