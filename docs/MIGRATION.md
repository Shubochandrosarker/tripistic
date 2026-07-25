# Tripistic v2.0.0 Migration Guide

## Overview

v2.0.0 is additive. It preserves current booking, payment, CRM, operations, and itinerary behavior while adding enterprise platform tables and UI scaffolding.

New migration:

```bash
prisma/migrations/20260725090000_v2_enterprise_platform/migration.sql
```

## Steps

1. Install dependencies.

```bash
npm install
```

2. Review environment variables.

```bash
cp .env.example .env
```

3. Apply migrations.

```bash
npm run db:migrate
```

4. Regenerate Prisma Client.

```bash
npm run db:generate
```

5. Run validation.

```bash
npm run lint
npm run typecheck
npm run test:unit
```

6. Run database-backed suites in an isolated test database.

```bash
npm run test:integration
npm run test:e2e
```

## New Tables

- `workspace_white_labels`
- `custom_domains`
- `ai_provider_configs`
- `maintenance_settings`

## New Enums

- `white_label_status`
- `custom_domain_status`
- `ai_provider_status`

## Data Backfill

No existing data requires backfill.

The migration inserts a singleton maintenance row:

```text
maintenance_settings.id = platform
maintenance_settings.enabled = false
```

## Rollout Notes

- Existing workspaces will continue using default Tripistic branding until a `workspace_white_labels` row is created.
- Existing public booking URLs continue to resolve by workspace slug.
- Custom domains should not be pointed at production until hostname resolution, DNS checks, and SSL provisioning are enabled.
- Maintenance mode is stored in the database but requires middleware enforcement before it blocks traffic.

## Rollback Notes

Because the migration creates new tables only, rollback is low-risk if no v2 data has been entered. If data exists, export these tables before dropping them.

Tables to export before rollback:

- `workspace_white_labels`
- `custom_domains`
- `ai_provider_configs`
- `maintenance_settings`
