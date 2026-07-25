# Frontend Architecture — Public Marketing Website

How the Tripistic public website is structured, how it stays separated from the
authenticated application, and where to change things.

## 1. Structural decision: route separation, not a monorepo

The original brief suggested an `apps/web` + `apps/app` split. **We did not do
that**, deliberately, and the reasoning is worth recording.

Splitting the repository into a monorepo would require moving every existing
route, layout, middleware matcher, Prisma import path, test path, and CI step —
a change that touches the authenticated application in hundreds of places. The
brief's first hard constraint is *never break the existing application*. A
structural migration of that size is the single most likely way to break it, and
it buys nothing the current structure does not already provide.

Instead the separation is enforced by **route boundary and dependency
direction**:

| Concern | Marketing | Application |
| --- | --- | --- |
| Routes | `/`, `/features`, `/solutions`, `/pricing`, `/docs`, `/help`, `/blog`, `/developers`, `/legal`, … | `/dashboard/*`, `/admin/*`, `/workspaces/*` |
| Shell | `components/marketing/marketing-shell.tsx` | `components/app/*`, `components/dashboard/*` |
| Data | `lib/content/*`, `lib/marketing/*` — filesystem only | `lib/db`, Prisma, tenancy guards |
| Auth | None. Every marketing route is public and statically rendered | `middleware.ts` matcher + server-side guards |
| Rendering | Static / ISR | Dynamic, per-request, tenant-scoped |

**The rule that matters:** no file under `lib/content/` or
`components/marketing/` may import Prisma, auth, or tenancy code. Marketing
pages must remain statically renderable with no database. This is what makes the
separation real — a monorepo boundary that still shared a database client would
be weaker than this.

If a monorepo split is wanted later, this dependency direction is exactly what
makes it mechanical rather than risky.

## 2. Directory map

```
app/
  layout.tsx                  Root layout: fonts, theme, skip link, site JSON-LD,
                              consent banner, analytics loader
  page.tsx                    Home
  og/route.tsx                Dynamic 1200×630 social card generation
  llms.txt/route.ts           Machine-readable site map for LLM crawlers
  sitemap.ts, robots.ts       Generated from the content layer
  icon.svg                    Brand mark and favicon

  features/, solutions/       Index + [slug], driven by lib/marketing/content.ts
  docs/, help/, blog/,        Index + [slug], driven by lib/content
  developers/, legal/
  blog/category/[category]/   Category archives

  api/marketing/              Public contact + newsletter endpoints

components/
  marketing/                  Public-site components (see COMPONENT-LIBRARY.md)
  analytics/                  Consent banner + consent-gated tag loader
  ui/                         Shared primitives used by both sides
  theme/                      Theme provider, script, toggle

lib/
  content/                    Frontmatter parser, markdown renderer, ContentSource
  marketing/                  Feature/solution/pricing/comparison data
  seo/                        site.ts, metadata.ts, schema.ts
  analytics/                  Consent state + event tracking

content/
  legal/    13 documents
  docs/     12 documents
  help/     12 documents
  blog/      9 documents
  developers/ 7 documents
```

## 3. Rendering strategy

| Route type | Strategy | Why |
| --- | --- | --- |
| Marketing pages | Static at build | No per-request data; fastest possible TTFB |
| Content detail pages | Static via `generateStaticParams` + `revalidate = 3600` | Scheduled publishing surfaces within an hour without a redeploy |
| `sitemap.xml`, `llms.txt` | ISR, 1 hour | Stay in sync with published content |
| `/og` | On demand, cached 24h | One image per unique title |
| Application routes | Dynamic | Tenant-scoped, per-request |

`revalidate = 3600` is what makes `publishedAt` scheduling work: a post dated in
the future is excluded from `listContent()` until a revalidation happens after
its date passes.

## 4. The content layer

```
content/<collection>/<slug>.md
        │
        ├── lib/content/frontmatter.ts   YAML-subset parser
        ├── lib/content/markdown.ts      Markdown → HTML, escapes all input
        └── lib/content/index.ts         ContentSource interface
                                          ├── fileContentSource (current)
                                          └── ← headless CMS implements here
```

`ContentSource` is the seam. It exposes `list(collection, options)` and
`get(collection, slug, options)`. Swapping `getContentSource()` to return an
API-backed source moves every marketing page onto a CMS without touching a
single page component.

**Why a custom markdown renderer instead of MDX?** Adding `@next/mdx` changes
`pageExtensions` and the build pipeline for the *whole* application, including
the authenticated side. A ~250-line renderer with no dependencies keeps the
blast radius at zero and keeps authored content portable — the same files work
unchanged if MDX is adopted later. The supported subset is documented in
`lib/content/markdown.ts`.

**Security note:** `renderMarkdown` HTML-escapes every input before emitting any
markup, and code spans are extracted before inline processing so their contents
stay literal. Link hrefs are restricted to `http(s):`, `mailto:`, `tel:`, `/`,
and `#`. This is why `Prose` can use `dangerouslySetInnerHTML` safely — the HTML
is produced by us, not by an author.

## 5. SEO layer

```
lib/seo/site.ts       Single source of truth for name, URL, emails, socials
lib/seo/metadata.ts   buildMetadata() → canonical, OG, Twitter, robots
lib/seo/schema.ts     JSON-LD builders, combined into one @graph per page
```

Every page calls `buildMetadata()`. Nothing hand-writes a canonical URL or an
Open Graph block. See `SEO-PLAN.md`.

## 6. Analytics and consent

`components/analytics/cookie-consent.tsx` owns the consent state, stored in a
first-party cookie for 12 months. `analytics-provider.tsx` reads that state and
mounts a provider only when **both** conditions hold: the visitor consented to
the matching category **and** the provider's environment variable is set.

With no variables set, the site makes zero third-party requests. Global Privacy
Control is honoured before the banner is ever shown.

## 7. Constraints for future changes

1. **Never import Prisma, auth, or tenancy code into marketing files.** It would
   force dynamic rendering and couple the two halves.
2. **Every new public page calls `buildMetadata()`** and renders `<Breadcrumbs>`
   plus at least `webPageSchema()`.
3. **Every new page's `<main>` carries `id="main"`** so the skip link works.
4. **New motion primitives check `useReducedMotion()`.**
5. **Content is authored in `content/`, never hardcoded into a page component.**
6. **Marketing API routes stay under `/api/marketing/`** and are covered by the
   robots disallow.

## Related

`PAGE-SITEMAP.md` · `SEO-PLAN.md` · `CONTENT-PLAN.md` · `DESIGN-SYSTEM.md` ·
`COMPONENT-LIBRARY.md` · `ANIMATION-GUIDE.md` · `ACCESSIBILITY.md` ·
`LEGAL-PAGES.md` · `LAUNCH-CHECKLIST.md`
