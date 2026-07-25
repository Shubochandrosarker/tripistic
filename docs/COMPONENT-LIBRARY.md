# Component Library

Every component available to the public website, what it is for, and when not
to use it.

## Shell and navigation

### `MarketingShell` — `components/marketing/marketing-shell.tsx`

Wraps every public page: sticky header, children, footer. Server component.

```tsx
<MarketingShell>
  <main id="main">…</main>
</MarketingShell>
```

Also exports `MarketingHeader` and `MarketingFooter` if a page needs them
separately. The footer includes the newsletter block, five link groups, social
links, cookie preferences, and the copyright line.

### `MobileNav` — client

Hamburger navigation below `lg`. Closes on Escape, restores focus to its
trigger, and moves focus to the first link when opened.

### `Breadcrumbs`

Accessible trail that **also emits `BreadcrumbList` structured data**. Prepends
Home automatically; the last item is `aria-current="page"` and unlinked.

```tsx
<Breadcrumbs items={[
  { name: "Docs", href: "/docs" },
  { name: doc.title, href: `/docs/${doc.slug}` },
]} />
```

Use on every page except the home page.

## Content rendering

### `Prose`

Renders authored markdown through `lib/content/markdown.ts` and applies
`.prose-content` styling. Safe with `dangerouslySetInnerHTML` because the
renderer escapes all input — see `FRONTEND-ARCHITECTURE.md` §4.

### `ContentArticle`

The shared reading layout for docs, help, blog, and developer pages: header with
category and metadata, prose body, table of contents, related documents, and
optional `sidebar`/`footer` slots.

```tsx
<ContentArticle
  doc={doc}
  basePath="/docs"
  breadcrumbs={[…]}
  related={relatedContent(doc, 4)}
  showAuthor            // blog only
  sidebar={<CallToAction />}
  footer={<Pagination />}
/>
```

### `TableOfContents`

Renders h2/h3 anchors from `extractHeadings()`. Returns `null` below two
headings, so short documents do not get a pointless sidebar.

### `ContentSearch` — client

Client-side search over a pre-indexed list. The index ships with the page, so
results are instant. Announces result counts to assistive technology via a
visually hidden live region. Suitable up to a few hundred documents; beyond that
move to a server-backed index.

### `ScreenshotFrame`

Renders a representative interface state as markup rather than a raster image —
sharp at any resolution, follows the active theme, costs no image bytes, and is
readable by a screen reader. Prefer this over a screenshot.

## Marketing sections — `marketing-sections.tsx`

| Component | Purpose |
| --- | --- |
| `SectionIntro` | Eyebrow + title + description, `align="center"` or `"left"` |
| `HeroSection` | Home hero with background image, stats, and CTAs |
| `ProductPreview` | Operations dashboard mock |
| `FeatureGrid` | Feature cards, optional `limit` |
| `CtaBand` | Closing conversion band with overridable copy |
| `FaqSection` | Home FAQ — keep in sync with `HOME_FAQS` in `app/page.tsx` |
| `SearchPanel` | Static search affordance |
| `featureIcons` | Slug → Lucide icon map |

## Interactive

### `PricingTable` — client

Billing interval toggle, four plan cards, and the six-group comparison matrix.
Data comes from `lib/marketing/pricing.ts` — change pricing there, not in the
component. Emits `pricing_interval_toggle` and `pricing_plan_select`.

### `RoiCalculator` — client

Six range inputs, memoised calculation, animated results, and payback period.
Assumptions (20% direct shift, 40% admin reduction, $149/mo baseline) are
constants at the top of the file **and stated in the rendered output** — if you
change them, the disclaimer updates with them.

### `ProductTour` — client

Tabbed walkthrough with positioned hotspots over a rendered preview. Proper
`role="tablist"`/`tab`/`tabpanel` wiring. Hotspots are `aria-pressed` toggle
buttons with screen-reader labels.

### `ContactForm` — client

Validated form posting to `/api/marketing/contact`. Honeypot field, explicit
error states with `role="alert"`, success state replacing the form, and
`trackConversion("contact_submit")`.

### `NewsletterSignup` — client

Email capture posting to `/api/marketing/subscribe`. Used in the footer, the
blog index, and blog post footers.

## Analytics and consent

### `CookieConsent` / `CookiePreferencesButton` — client

Four-category consent banner. Rejecting is exactly as easy as accepting. Honours
Global Privacy Control without ever showing the banner. `CookiePreferencesButton`
in the footer reopens it — required by the Cookie Policy.

### `AnalyticsProvider` — client

Mounts GA4, GTM, Clarity, Meta Pixel, and LinkedIn Insight only when the visitor
consented to the matching category **and** the provider's environment variable
is set. With no variables set, zero third-party requests are made.

## Motion — `motion.tsx`

All client components. Every one checks `useReducedMotion()`.

| Component | Use |
| --- | --- |
| `AnimatedReveal` | Single element fade-and-lift on scroll |
| `StaggerGroup` / `StaggerItem` | Sequenced reveal for a group |
| `Counter` | Count-up on entering view; renders the final value under reduced motion |
| `Parallax` | Subtle vertical offset through the viewport |
| `GradientBackdrop` | Ambient animated orbs; `aria-hidden` |
| `PageTransition` | Route-change fade |
| `ScrollProgress` | Reading progress bar |
| `LoadingShimmer` | Placeholder with `role="status"` |

See `ANIMATION-GUIDE.md`.

## SEO

### `JsonLd`

Combines schema nodes into one `@graph` document. Escapes `<` so a string value
can never terminate the script element.

```tsx
<JsonLd schema={[
  webPageSchema({ title, description, path }),
  faqSchema(FAQS),
]} />
```

## Shared primitives — `components/ui/`

`Button` / `ButtonLink`, `Input` / `Select` / `Field`, plus `SectionCard`,
`StatusBadge`, `EmptyState`, `ErrorState`, `LoadingState`, `TableShell`,
`ConfirmDialog`, `PageHeader`, `RoleBadge` — shared with the application. When
adding to `ui/`, check both sides still render correctly.

## Checklist for a new component

1. Server component unless it needs state, effects, or event handlers.
2. Design tokens only — no literal colours.
3. Visible `focus-visible` ring on every interactive element.
4. Works at 320px and at 200% zoom.
5. `useReducedMotion()` if it animates.
6. Status conveyed by more than colour.
7. Content from `content/` or `lib/marketing/`, not hardcoded prose.
8. Documented here.
