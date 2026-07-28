# Tripistic v2.0.0 White Label

## Goal

White-label support lets an organization present Tripistic-powered booking, itinerary, email, PDF, and API surfaces under its own brand.

## Data Model

Table: `workspace_white_labels`

Fields:

- `workspace_id`
- `brand_name`
- `logo_url`
- `favicon_url`
- `primary_color`
- `accent_color`
- `support_email`
- `login_headline`
- `email_from_name`
- `pdf_footer`
- `api_brand_name`
- `status`

Statuses:

- `draft`
- `active`
- `disabled`

## Brand Surfaces

Required surfaces:

- Public booking pages.
- Login and invitation pages.
- Email sender identity and templates.
- PDF itinerary/waiver exports.
- API response brand metadata.
- Embedded booking widgets.

## Admin Surface

Current v2 page:

- `/admin/white-labels`

Current API:

- `GET /api/admin/white-labels`

## Operator Surface

Current public-launch Phase 3 page:

- `/dashboard/website`

Current APIs:

- `GET /api/workspaces/:id/storefront`
- `PATCH /api/workspaces/:id/storefront`
- `POST /api/workspaces/:id/storefront/publish`
- `GET /api/workspaces/:id/media`
- `POST /api/workspaces/:id/media/upload-intent`
- `POST /api/workspaces/:id/media/:assetId/complete`

Current models:

- `workspace_storefronts`
- `workspace_storefront_revisions`
- `workspace_media_assets`

Published storefront content is currently bound to `/book/:workspaceSlug`.

## Runtime Resolution

Resolution order should be:

1. Custom domain hostname.
2. Workspace slug route.
3. Default Tripistic brand fallback.

## Security

- Only workspace owners/admins should edit their brand kit.
- Platform admins can review and disable brand kits.
- Logo/favicon URLs should be validated and proxied or stored in managed storage.
- Rich HTML branding inputs should not be accepted without sanitization.

## Remaining Work

- Server-side uploaded-object byte inspection and responsive image variants.
- Media deletion, orphan cleanup, and rollback UI.
- Email/PDF template binding.
- Full storefront route set beyond the booking index/detail pages.
- API brand metadata in public responses.
- Audit log events for brand changes.
