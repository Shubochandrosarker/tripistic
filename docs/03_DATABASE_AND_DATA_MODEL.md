# Tripistic — Database & Data Model Spec

**Engine:** PostgreSQL. **ORM:** Prisma. **Tenancy:** shared database, shared schema, `workspace_id` row-level isolation (best cost/complexity fit for MVP SaaS; supports agency multi-workspace naturally).

**Conventions**
- Primary keys: `cuid()` text ids.
- Money: integer **cents** + ISO currency code.
- Timestamps: `created_at`, `updated_at` on all tables; `deleted_at` (soft delete) where records carry business history.
- Statuses: Postgres enums.
- Every tenant-owned table: `workspace_id` FK + index. `created_by` where useful.
- Naming: snake_case in DB (`@@map`/`@map`), camelCase in Prisma client.

## 1. Phase 1 tables (implemented now)

### users
| Column | Type | Notes |
|---|---|---|
| id | text PK | cuid |
| name | text | |
| email | text unique | citext-like handling in app layer (lowercased) |
| email_verified_at | timestamptz? | verification later |
| password_hash | text? | bcrypt; null for future OAuth users |
| auth_provider_id | text? | future OAuth |
| avatar_url | text? | |
| is_platform_admin | boolean default false | platform-level role |
| status | user_status default 'active' | active/suspended/deactivated |
| last_login_at | timestamptz? | |
| created_at / updated_at / deleted_at | | |

### workspaces
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| name | text | |
| slug | text unique | url-safe, generated + de-duplicated |
| business_type | business_type | solo_guide / small_operator / multi_guide_operator / rental_activity_business / multi_day_tour_operator / agency |
| owner_id | text FK→users | primary owner (memberships are authoritative for access) |
| timezone | text default 'UTC' | IANA name |
| currency | char(3) default 'USD' | ISO 4217 |
| country | char(2)? | ISO 3166-1 |
| status | workspace_status default 'active' | active/suspended/archived |
| trial_ends_at | timestamptz? | mirror of subscription trial for quick reads |
| created_at / updated_at / deleted_at | | |

### workspace_members
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| workspace_id | FK→workspaces (indexed) | |
| user_id | FK→users (indexed) | |
| role | workspace_role | workspace_owner/workspace_admin/guide/staff/viewer |
| status | member_status default 'active' | active/suspended |
| invited_by | text? FK→users | |
| joined_at | timestamptz default now | |
| created_at / updated_at | | unique (workspace_id, user_id) |

### invitations
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| workspace_id | FK (indexed) | |
| email | text | lowercased |
| role | workspace_role | |
| token | text unique | 32-byte random hex |
| status | invitation_status default 'pending' | pending/accepted/expired/revoked |
| invited_by_id | FK→users | |
| expires_at | timestamptz | +7 days |
| accepted_at | timestamptz? | |
| created_at / updated_at | | index (workspace_id, email) |

### audit_logs
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| workspace_id | FK? (indexed) | null for platform-level events |
| user_id | FK? (indexed) | actor; null for system |
| action | text (indexed) | e.g. user_login, workspace_created |
| entity_type | text? | e.g. workspace, member, invitation |
| entity_id | text? | |
| metadata | jsonb? | non-sensitive context only |
| ip_address | text? | |
| user_agent | text? | |
| created_at | timestamptz | append-only; no update/delete |

### settings
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| workspace_id | FK (indexed) | |
| key | text | allow-listed keys (business_name, timezone, currency, default_language, booking_notice_period, cancellation_policy, email_from_name, brand_color, …) |
| value | text | serialized by `type` |
| type | setting_type default 'string' | string/number/boolean/json |
| created_at / updated_at | | unique (workspace_id, key) |

### plans
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| name / slug unique / description | | seeded: solo, operator, growth, agency |
| price_monthly / price_yearly | integer | cents |
| currency | char(3) default 'USD' | |
| features | jsonb | marketing feature list |
| limits | jsonb | {users, tour_products, ai_credits_monthly, …}; -1 = unlimited |
| is_active | boolean default true | |
| created_at / updated_at | | |

### subscriptions
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| workspace_id | FK (indexed) | one active row per workspace (app-enforced) |
| plan_id | FK→plans | |
| status | subscription_status default 'trialing' | trialing/active/past_due/cancelled/expired |
| billing_provider | text? | 'stripe' later |
| provider_customer_id / provider_subscription_id | text? | Phase 10 |
| trial_ends_at / current_period_start / current_period_end / cancel_at | timestamptz? | |
| created_at / updated_at | | |

### feature_flags
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| workspace_id | FK? (indexed) | workspace override row |
| plan_id | FK? (indexed) | plan default row |
| feature_key | text (indexed) | ai_growth_dashboard, booking_engine, stripe_payments, digital_waivers, guide_scheduling, ota_sync, white_label, custom_domain |
| enabled | boolean default false | |
| limit_value | integer? | optional numeric limit |
| created_at / updated_at | | resolution: workspace override → plan default → disabled |

## 2. Future tables (Phases 2–9 — designed, not created yet)

- **tours** (workspace_id, title, slug, description, duration_minutes, location, capacity, base_price, currency, status, cancellation_policy, waiver_required, created_by, timestamps, deleted_at)
- **availabilities** (workspace_id, tour_id, starts_at, ends_at, capacity, booked_count, guide_id?, status)
- **bookings** (workspace_id, tour_id, availability_id, customer_id, status, total_amount, paid_amount, payment_status, source, reference, created_by?, timestamps, deleted_at)
- **participants** (workspace_id, booking_id, name, age_band?, waiver_signature_id?)
- **customers** (workspace_id, name, email, phone, country, tags[], consent_status, notes, timestamps, deleted_at; unique (workspace_id, email))
- **payments** (workspace_id, booking_id, provider, provider_payment_id, amount, currency, kind full/deposit/installment/refund, status, timestamps)
- **waiver_templates** / **waiver_versions** (immutable) / **waiver_signatures** (signed snapshot ref, participant_id, booking_id, signed_at, ip, user_agent)
- **guides** profile extension + **assignments** (availability_id, guide_id)
- **messages** (workspace_id, booking_id?, customer_id?, channel, template_key, status, sent_at)
- **ai_insights** (workspace_id, insight_type, title, summary, recommendation, priority_score, expected_impact, confidence, status new/accepted/dismissed/completed, source_data jsonb, timestamps)
- **channel_connections** / **external_listings** / **sync_jobs** (Phase 9)

All follow the same conventions; every one carries `workspace_id`.

## 3. Integrity & isolation rules

1. **No tenant query without workspace scope.** App-layer helpers (`lib/tenancy`) resolve the caller's membership first and inject `workspace_id` into every Prisma query. Raw unscoped queries on tenant tables are a code-review blocker.
2. **Cross-workspace references are invalid.** When linking rows (e.g., future booking→tour), both must share `workspace_id` — enforced in service layer.
3. **Last-owner protection.** A workspace must always retain ≥1 active `workspace_owner` member.
4. **Audit logs are append-only.**
5. **Soft-deleted rows** are excluded by default in helpers; hard deletes reserved for GDPR erasure workflows (later).
6. Optional future hardening: Postgres RLS policies keyed on `workspace_id` (Phase 11 candidate — app-layer isolation is authoritative for MVP).

## 4. Migration & seed strategy

- Migrations live in `prisma/migrations` (SQL, checked in). Initial migration generated from schema; applied with `prisma migrate deploy` (prod) / `prisma migrate dev` (local).
- Seed (`prisma/seed.ts`): upserts the 4 plans + plan-level feature flags; optionally creates a platform admin **only** when `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` env vars are provided (never a hardcoded credential).
