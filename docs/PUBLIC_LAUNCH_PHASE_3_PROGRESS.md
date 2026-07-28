# Public Launch Phase 3 Progress

Date: 2026-07-27

## Completed in this checkpoint

- Added `WorkspaceStorefront` for workspace-scoped draft and published storefront content.
- Added immutable `WorkspaceStorefrontRevision` rows for each publish.
- Added `WorkspaceMediaAsset` for managed media metadata with workspace-prefixed storage keys, alt text, status, dimensions, and focal point.
- Added S3-compatible presigned PUT upload signing through `S3_*` environment variables.
- Added owner/admin storefront draft, publish, media-list, upload-intent, and upload-complete API routes.
- Added `/dashboard/website` with guided brand/content controls, media upload, publish status, public preview link, and revision history.
- Added Website to dashboard navigation.
- Bound published storefront brand, hero, page sections, SEO metadata, and managed media selections into `/book/[workspaceSlug]`.

## External configuration required

- Configure `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE_URL`, and bucket CORS for browser `PUT` uploads.
- Configure the bucket/CDN so `S3_PUBLIC_BASE_URL` serves uploaded objects.
- Apply the new Prisma migration before using the Website dashboard in a persistent environment.

## Verification

| Command | Result |
| --- | --- |
| `cmd /c npx prisma format` | Passed |
| `cmd /c npm run db:generate` | Passed |
| `cmd /c "set DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tripistic_test&& npx prisma validate"` | Passed |
| `cmd /c npm run test:unit` | Passed: 17 files, 101 tests |
| `cmd /c npm run lint` | Passed |
| `cmd /c npm run typecheck` | Passed after rerun; first parallel run collided with `next build` rewriting `.next/types` |
| `cmd /c npm run build` | Exited 0; still logs known Prisma `DATABASE_URL` warnings during static generation in this environment |
| `cmd /c npm run test:integration` | Blocked: no `DATABASE_URL` configured for a real PostgreSQL test database |
| `cmd /c npm run test:e2e` | Blocked: no `DATABASE_URL` configured for a real PostgreSQL test database |

## Not complete yet

- Server-side magic-byte validation and responsive image variant generation still need a worker or upload-finalization job that can read uploaded object bytes.
- Media deletion/orphan cleanup is not implemented yet.
- Storefront custom routes beyond `/book/[workspaceSlug]` are not implemented yet.
- Draft preview isolation, rollback UI, navigation editor, custom page editor, cookie preferences, and legal template confirmation workflow remain pending.
- Custom domain hostname routing and SSL remain Phase 4 work.
