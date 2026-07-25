# Tripistic v2.0.0 Changelog

## Added

- Persisted Light/Dark/System theme engine.
- First-paint theme script to avoid theme flash.
- Topbar theme segmented control.
- Global AI command palette with Ctrl/Command K.
- Workspace search endpoint for bookings, customers, tours, and itineraries.
- Expanded Super Admin navigation.
- Revenue admin page with MRR, ARR, guest payment volume, and plan mix.
- License admin page with active/suspended seat visibility.
- Custom Domains admin page.
- White Labels admin page.
- AI Providers admin page.
- System Health admin page.
- Maintenance Mode admin page.
- Admin JSON endpoints for domains, white labels, AI providers, and maintenance.
- Prisma models and migration for white labels, custom domains, AI provider configs, and maintenance settings.
- v2 documentation suite:
  - `docs/AUDIT.md`
  - `docs/ARCHITECTURE.md`
  - `docs/MIGRATION.md`
  - `docs/UI-SYSTEM.md`
  - `docs/SUPER-ADMIN.md`
  - `docs/WHITE-LABEL.md`
  - `docs/CUSTOM-DOMAINS.md`

## Changed

- Package version updated for v2.0.0.
- `next` upgraded to `15.5.21`.
- `next-auth` upgraded to `5.0.0-beta.32`.
- `postcss` and `sharp` are overridden to patched versions for a clean production audit.
- Admin sidebar labels now reflect enterprise platform language.
- Theme CSS now uses explicit `html[data-theme]` modes with system fallback.

## Security

- New admin endpoints are protected by platform-admin API guards.
- New workspace search endpoint is tenant-scoped and RBAC-aware.
- New enterprise tables are additive and tenant-linked where applicable.
- `npm audit --omit=dev` reports 0 vulnerabilities after dependency updates.

## Known Follow-Up

- Add middleware enforcement for maintenance mode.
- Add runtime custom-domain host resolution.
- Add DNS and SSL verification workers.
- Add operator-facing white-label and domain builders.
- Add CSP/security headers, CSRF/origin checks for high-risk mutations, and WAF/CDN rate limits.
- Add accessibility, responsive, and Lighthouse CI gates for v2 UI.
