# SEO Plan

What is implemented, how to use it, and what remains a launch task.

## 1. The metadata contract

Every public page calls `buildMetadata()` from `lib/seo/metadata.ts`. Nothing
hand-writes a canonical URL or an Open Graph block.

```ts
export const metadata = buildMetadata({
  title: "Pricing · Plans for operators, agencies, and enterprise",
  description: DESCRIPTION,   // 140–160 characters
  path: "/pricing",           // drives the canonical URL
  eyebrow: "Pricing",         // rendered on the generated social card
  keywords: ["tour operator software pricing", "booking software cost"],
});
```

It emits:

| Output | Value |
| --- | --- |
| `alternates.canonical` | `absoluteUrl(path)` — always self-referencing |
| `openGraph` | type, url, siteName, locale, title, description, 1200×630 image |
| `twitter` | `summary_large_image`, site, creator, title, description, image |
| `robots` | `index, follow` with `max-image-preview: large`, `max-snippet: -1` |
| Article extras | `publishedTime`, `modifiedTime`, `authors` when `type: "article"` |

Pass `noIndex: true` for not-found states so a 404 never competes in the index.

### Title and description rules

- **Titles:** 50–60 characters. Primary term first, qualifier after a `·`. The
  root layout template appends `· Tripistic`, so page titles must not repeat it.
- **Descriptions:** 140–160 characters, written as a reason to click, not a
  keyword list. Content pages fall back to the document's own `description`
  frontmatter.
- Every title on the site is unique. Every description is unique.

## 2. Structured data

`lib/seo/schema.ts` provides typed builders, combined into a single
`@graph` document per page by `<JsonLd>`.

| Builder | Where |
| --- | --- |
| `organizationSchema` | Root layout — every page |
| `websiteSchema` | Root layout — includes `SearchAction` pointing at `/help` |
| `softwareApplicationSchema` | Root layout — `AggregateOffer` 49–399 USD |
| `webPageSchema` | Every public page |
| `breadcrumbSchema` | Emitted automatically by `<Breadcrumbs>` |
| `faqSchema` | Home, pricing, demo, why-tripistic |
| `articleSchema` | Blog posts, help articles, legal documents |
| `techArticleSchema` | Documentation and developer reference |
| `productSchema` | Pricing — one `Offer` per paid plan |
| `itemListSchema` | Index pages: features, solutions, docs, help, blog, legal, developers |
| `jobPostingSchema` | Available for careers when real postings are added |

`JsonLd` escapes `<` as `<` so a string value can never terminate the
script element.

## 3. Social cards

`/og` generates a 1200×630 card per unique title using `next/og`, cached for 24
hours. `buildMetadata` builds the URL automatically, so no page needs a designed
image, and a title change never leaves a stale card behind.

Pass `image` to `buildMetadata` to override with a static asset where a designed
card is worth it — the home page and major campaign landing pages are the
candidates.

## 4. Crawl surface

### `robots.txt`

Disallows `/dashboard`, `/admin`, `/api`, `/og`, `/book/confirmation`,
`/itinerary/`, `/invite/`, `/unsubscribe/`, `/workspaces/`. Guest-token URLs are
excluded because the token *is* the credential.

A second rule explicitly allows GPTBot, ClaudeBot, PerplexityBot, and
Google-Extended so `llms.txt` is reachable. Remove that rule if the business
decides to opt out of AI crawling — it is a business decision, not a technical
one.

### `sitemap.xml`

Generated from route lists plus the content layer, so a new markdown file
appears automatically. Per-document `lastModified` comes from `updatedAt`, with
priorities: home 1.0, primary marketing 0.8–0.9, feature/solution 0.75,
docs/developers 0.7, blog 0.65, help 0.6, legal 0.45.

### `llms.txt`

A grouped, machine-readable map of the site following the llmstxt.org
convention: core pages, features, solutions, developers, documentation, help,
blog, company, legal. Regenerated hourly.

## 5. Internal linking

- Footer links five groups from every page.
- Feature pages cross-link related features by resolved slug.
- Solution pages cross-link six sibling verticals.
- Docs and developer pages carry prev/next pagination.
- Content pages carry a "keep reading" block prioritising same-category items.
- Blog posts link to their category archive.
- Every content page breadcrumbs back to its section index.

No public page sits more than two clicks from the home page.

## 6. Keyword map

| Cluster | Primary target | Pages |
| --- | --- | --- |
| Category | tour operator software, travel operations platform | `/`, `/features` |
| Capability | booking software, tour CRM, dispatch software | `/features/[slug]` (17) |
| Vertical | travel agency software, DMC software, group travel software | `/solutions/[slug]` (13) |
| Comparison | tripistic vs rezdy / fareharbor / checkfront / wetravel / tourflows | `/why-tripistic` |
| Commercial | tour booking software pricing, 0% commission booking software | `/pricing` |
| AI | AI for tour operators, AI itinerary builder | `/ai-platform`, `/features/ai`, blog |
| White label | white label booking software, custom domain booking pages | `/white-label` |
| Developer | tour operator API, travel booking API, booking webhooks | `/developers/*` |
| Informational | direct booking strategy, peak season operations, travel automation | `/blog/*` |
| Support | long-tail "how do I…" queries | `/help/*`, `/docs/*` |

Help and documentation carry the long tail; comparison and pricing carry
commercial intent; the blog carries top-of-funnel.

## 7. Performance as a ranking factor

| Decision | Effect |
| --- | --- |
| Static/ISR rendering everywhere | Minimal TTFB |
| Interface previews rendered as markup, not images | Near-zero image weight; no LCP image to optimise |
| `next/font` with Geist | No layout shift, no external font request |
| Analytics only after consent, `strategy="afterInteractive"` | Third-party JS never blocks first paint |
| Client components limited to genuinely interactive pieces | Small hydration payload |
| Wide tables scroll inside their own container | No layout shift, no horizontal page scroll |

## 8. Launch tasks (not code)

These need account access and cannot be completed in the repository:

- [ ] Set `NEXT_PUBLIC_APP_URL` to the production origin — every canonical, OG
      URL, and sitemap entry derives from it.
- [ ] Verify the property in Google Search Console; set
      `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- [ ] Submit `sitemap.xml` in Search Console and Bing Webmaster Tools.
- [ ] Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` and/or `NEXT_PUBLIC_GTM_ID`.
- [ ] Configure conversion events in GA4 from the `MarketingEvent` union in
      `lib/analytics/events.ts`.
- [ ] Replace the placeholder social URLs in `lib/seo/site.ts` with real profiles
      — they are emitted as `sameAs` in Organization schema.
- [ ] Validate structured data with Google's Rich Results Test on one page of
      each type.
- [ ] Run Lighthouse against the production build and record scores in
      `LAUNCH-CHECKLIST.md`.
- [ ] Decide the AI-crawler policy and adjust `robots.ts` accordingly.

## 9. Ongoing

- **Monthly:** Search Console coverage and query drift; refresh the two or three
  pages losing position.
- **Quarterly:** re-verify the competitor comparison and update
  `COMPARISON_REVIEWED` in `lib/marketing/content.ts`; refresh legal `updatedAt`
  dates where documents changed.
- **Per release:** add a changelog entry; update release notes; publish a
  Product Updates post for anything user-visible.
