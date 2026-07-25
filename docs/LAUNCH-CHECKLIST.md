# Launch Checklist

What is done, what needs an account or a deployment, and what must be true
before the marketing site goes live.

## 1. Build status

Verified in this repository at the time of writing:

| Check | Command | Status |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | Passing, 0 errors |
| Lint | `npm run lint` | Passing, 0 errors, 0 warnings |
| Unit tests | `npm run test:unit` | 74 passing across 9 files |
| Production build | `npm run build` | Passing — 100 public pages generated |
| Prisma schema | `npx prisma validate` | Unchanged from `main` |

The application was not modified. No schema change, no migration, no change to
any route under `/dashboard`, `/admin`, or `/workspaces`, and no change to
authentication, tenancy, payments, or messaging logic. New API routes are
additive and confined to `/api/marketing/`.

## 2. Implemented

### Pages — 100 public routes

- [x] Home with all 12 required sections
- [x] Features index + 17 feature detail pages
- [x] Solutions index + 13 vertical pages with case studies
- [x] Pricing with interval toggle, comparison matrix, ROI calculator, FAQ
- [x] Demo with interactive tour, hotspots, videos, live-demo booking
- [x] Why Tripistic with a 12-dimension comparison
- [x] AI Platform, White Label, Customer Portal, Integrations
- [x] Developers + 7 reference pages + `openapi.json`
- [x] Documentation hub + 12 sections
- [x] Help Center + 12 articles with search
- [x] Blog + 9 posts + 9 category archives
- [x] Changelog, Roadmap, Customer Stories, Partners, Careers, About, Contact
- [x] Legal center + 13 documents

### SEO

- [x] `buildMetadata()` on every page — canonical, OG, Twitter, robots
- [x] JSON-LD: Organization, WebSite, SoftwareApplication site-wide; WebPage,
      BreadcrumbList per page; FAQPage, Article, TechArticle, Product, ItemList
      where applicable
- [x] Breadcrumbs on every page except home
- [x] Dynamic OG image generation at `/og`
- [x] `sitemap.xml` generated from routes + content with per-document dates
- [x] `robots.txt` excluding authenticated, API, and guest-token routes
- [x] `llms.txt`
- [x] Internal linking — nothing more than two clicks from home

### Performance

- [x] Static/ISR rendering for all marketing routes
- [x] Interface previews rendered as markup rather than images
- [x] `next/font` — no external font request, no layout shift
- [x] Analytics loaded `afterInteractive` and only after consent
- [x] Client components limited to genuinely interactive pieces

### Accessibility

- [x] Skip link and `<main id="main">` on every page
- [x] Labelled landmarks, single h1, no skipped heading levels
- [x] Uniform visible focus indicator
- [x] Colour never the sole carrier of meaning
- [x] Labelled form fields, announced errors
- [x] Reduced-motion respected in CSS and in every motion primitive
- [x] 320px and 200% zoom support; no horizontal page scroll

### Analytics

- [x] Consent-gated GA4, GTM, Clarity, Meta Pixel, LinkedIn Insight
- [x] Four-category consent banner with Global Privacy Control support
- [x] Footer cookie preferences control
- [x] `trackEvent` / `trackConversion` with a typed event union

### CMS

- [x] Markdown content layer with frontmatter
- [x] Draft flag and scheduled publishing via `publishedAt` + hourly revalidation
- [x] `ContentSource` seam for a headless CMS
- [x] Media library with required alt text

### Documentation

- [x] All 10 deliverable documents in `/docs`

## 3. Blocking — must be done before launch

These cannot be completed in the repository.

### Legal

- [ ] **Full review of all 13 documents by qualified counsel.** They are
      templates and say so. See `LEGAL-PAGES.md` §6 for the complete list,
      including registered entity details, DMCA agent registration, EU/UK
      representatives, governing law, and SCC module selection.
- [ ] Verify the subprocessor list matches production reality.
- [ ] Confirm the SLA targets are sustainable before they become contractual.
- [ ] Confirm the Security Policy describes controls that actually exist.

### Configuration

- [ ] Set `NEXT_PUBLIC_APP_URL` to the production origin. Every canonical URL,
      OG URL, and sitemap entry derives from it — this is the single highest-risk
      configuration value.
- [ ] Configure SMTP (`SMTP_HOST`, `EMAIL_FROM`) or the contact and newsletter
      forms will log submissions instead of delivering them.
- [ ] Replace the placeholder social URLs in `lib/seo/site.ts` — they are emitted
      as `sameAs` in Organization structured data.
- [ ] Confirm the email addresses in `lib/seo/site.ts` are monitored inboxes.

### Content accuracy

- [ ] Verify the pricing in `lib/marketing/pricing.ts` matches commercial reality.
- [ ] Verify the plan feature matrix matches what each plan actually enables.
- [ ] Confirm the competitor comparison is accurate as of its review date and
      that the disclaimer is acceptable to counsel.
- [ ] Replace composite case studies with real ones as customers consent, or
      confirm the composite disclaimer is acceptable.
- [ ] Confirm the API documentation matches the deployed API surface.

## 4. Should be done before launch

### Verification

- [ ] Lighthouse against the production build — target 95+ on Performance, SEO,
      Best Practices, Accessibility. Record scores below.
- [ ] Google Rich Results Test on one page of each structured-data type.
- [ ] Manual accessibility passes listed in `ACCESSIBILITY.md` §2. **Do not claim
      conformance beyond "partially conformant" until these are complete.**
- [ ] Cross-browser check: Chrome, Safari, Firefox, Edge — light and dark.
- [ ] Mobile check on a real mid-range Android device, not only a simulator.
- [ ] Verify every external link resolves.
- [ ] Verify the OG image renders for a long title and a short one.

### Analytics

- [ ] Set `NEXT_PUBLIC_GA_MEASUREMENT_ID` and/or `NEXT_PUBLIC_GTM_ID`.
- [ ] Verify Search Console and set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- [ ] Submit `sitemap.xml` to Search Console and Bing Webmaster Tools.
- [ ] Configure conversion events in GA4 from the `MarketingEvent` union.
- [ ] Confirm no analytics requests fire before consent — check the network tab
      on a first visit.
- [ ] Confirm Global Privacy Control suppresses the banner and the tags.

### Functional

- [ ] Submit the contact form and confirm delivery to the routed inbox.
- [ ] Subscribe to the newsletter and confirm delivery.
- [ ] Confirm the honeypot returns 202 without delivering.
- [ ] Confirm the theme toggle persists across navigation and reload.
- [ ] Confirm the cookie preferences control reopens the banner.
- [ ] Confirm `/openapi.json`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` all
      serve correctly.

## 5. Post-launch

**Week one:** watch Search Console for coverage errors; confirm analytics is
recording; watch for 404s from any changed URL; monitor form submissions.

**Month one:** review query data and refresh underperforming titles and
descriptions; write the help articles the support queue reveals are missing;
publish the first new blog post.

**Ongoing:** the cadence in `CONTENT-PLAN.md` §8 and `SEO-PLAN.md` §9.

## 6. Lighthouse scores

Record actual measured scores here after the first production deploy. Leave
blank rather than guessing — an unverified number in a launch document is worse
than an empty cell.

| Page | Performance | Accessibility | Best Practices | SEO |
| --- | --- | --- | --- | --- |
| `/` | | | | |
| `/pricing` | | | | |
| `/features/bookings` | | | | |
| `/docs/getting-started` | | | | |
| `/blog/direct-booking-playbook` | | | | |
| `/legal/privacy-policy` | | | | |

## 7. Rollback

The marketing site is additive. If something is wrong, revert the marketing
commits — the application is untouched by them and will continue to run. There
is no migration to undo and no data to restore.
