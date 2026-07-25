# Content Plan

How marketing content is authored, published, and maintained.

## 1. Where content lives

```
content/
  legal/        13 documents
  docs/         12 documents
  help/         12 documents
  blog/          9 documents
  developers/    7 documents
```

Every file is markdown with frontmatter. Nothing that reads as prose belongs in
a page component.

## 2. Frontmatter reference

```markdown
---
title: How do I create my first tour?
description: Step-by-step instructions for adding a tour and making it bookable.
eyebrow: Setup                # optional label above the title
category: Getting Started     # groups the document on its index page
tags: [tours, setup]          # rendered as chips, used as keywords
author: Tripistic Team        # blog only
authorRole: Product           # blog only
publishedAt: 2026-07-01       # ISO date; a future date schedules the document
updatedAt: 2026-07-14         # defaults to publishedAt
order: 1                      # sort order on index pages (blog sorts by date)
featured: true                # optional emphasis
draft: false                  # true hides the document entirely
---
```

`title` and `description` are the only required fields. `description` falls back
to the first ~160 characters of the body, and `excerpt` to ~190.

## 3. Publishing workflow

1. Add or edit a `.md` file under the right collection.
2. Commit and deploy. `generateStaticParams` picks it up; index pages,
   `sitemap.xml`, and `llms.txt` update automatically.

**Drafts.** `draft: true` excludes a document from every listing, from
`generateStaticParams`, and from the sitemap.

**Scheduled publishing.** A `publishedAt` in the future excludes the document
until that date passes. Content routes carry `revalidate = 3600`, so a scheduled
document appears within an hour of its date without a redeploy.

**Headless CMS.** `ContentSource` in `lib/content/index.ts` is the seam. Point
`getContentSource()` at an API-backed implementation of `list`/`get` and every
page keeps working. Frontmatter field names map directly to CMS fields.

## 4. Supported markdown

Headings (h1–h4), paragraphs, bold, italic, inline code, links, images,
unordered and ordered lists, blockquotes, fenced code with a language hint,
tables, and horizontal rules.

Deliberately unsupported: raw HTML, footnotes, definition lists, nested lists
beyond one level. If a document needs more structure than this, it probably
wants to be a page component.

Tables auto-wrap in a horizontally scrolling container so wide comparison tables
never force the page to scroll sideways.

## 5. Editorial standards

**Every document must:**

- Open with what the reader gets, not with throat-clearing.
- Use `##` headings that describe content, so the table of contents is useful.
- Prefer a table over three parallel paragraphs.
- Link to at least two related pages, ending with a **Related** line.
- State limits honestly. "This is a template, have counsel review it" and "these
  figures are representative, not a guarantee" belong in the document, not in a
  footnote nobody reads.

**Voice:** direct, specific, unhyped. No "revolutionary", "seamless",
"game-changing", or "unlock". Claims are concrete and checkable.

**Product accuracy:** if a document describes behaviour, it must match the
product. A help article that describes a setting that does not exist is worse
than no article.

## 6. Collection-specific guidance

### Legal

Every legal document carries a template notice recommending review by counsel,
and every one shows both an effective date and a last-updated date. When a
document changes materially, update `updatedAt` and notify administrators where
the document itself promises notice.

### Documentation

Written for someone doing the task now, not evaluating the product. Front-load
the steps; put explanation after. Include the failure modes — the "why is this
not working" table is usually the most-read part.

### Help Center

One question per article, phrased the way a user would ask it. Troubleshooting
articles list causes **in the order worth checking**, cheapest first. Every
article ends with an escape hatch to support.

### Blog

Nine categories, each with at least one anchor post. Posts argue something and
support it with specifics. A post that could have been a feature page is not a
blog post.

Cadence target: two posts a month, alternating top-of-funnel (Growth, Marketing,
Industry News) with practitioner content (Operations, Automation, AI).

### Developer reference

Every code sample must run. Error handling is shown, not elided — the retry
loop, the signature verification, the `409` case. Samples that skip error
handling teach people to ship integrations that break.

## 7. Media

`lib/content/media.ts` is the media library. Assets are referenced by `id`, and
every entry requires alt text. This keeps alt text a data requirement rather
than an author's afterthought, and lets assets be re-pointed at a CDN without
editing copy.

Where an interface needs to be shown, prefer `ScreenshotFrame` — a rendered
markup preview — over a raster screenshot. It stays sharp, follows the theme,
never goes stale when the UI changes colour, costs no image bytes, and is
readable by a screen reader.

## 8. Maintenance schedule

| Cadence | Task |
| --- | --- |
| Per release | Changelog entry, release notes, Product Updates post if user-visible |
| Monthly | Review help articles against actual support tickets; write the missing one |
| Quarterly | Re-verify the competitor comparison and bump `COMPARISON_REVIEWED`; review legal documents for accuracy |
| Annually | Full legal review with counsel; refresh case study figures; prune stale blog posts |

## 9. Backlog

Content the site is ready for but does not yet have:

- Per-vertical case studies for the eight verticals currently sharing composites.
- Individual competitor comparison pages (`/compare/tripistic-vs-rezdy`, etc.) —
  high commercial intent, and the comparison data model already supports them.
- Real customer stories with named attribution, replacing the composites.
- Localised content for EU markets.
- Video transcripts as indexable pages.
- A glossary of travel-operations terms for long-tail capture.
