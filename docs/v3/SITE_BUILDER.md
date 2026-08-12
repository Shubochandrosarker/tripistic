# Tripistic Site Builder

## Content model

A page is `{ version: 1, sections: SiteSection[] }`, where every section is one
of 30 typed variants validated by Zod (`lib/sites/schema.ts`). **There is no
raw-HTML section, and adding one would undo the security model.**

Why it matters: pages are authored by operators and, increasingly, by a model
on their behalf, and they render on a hostname that also carries the booking
flow. With arbitrary markup every page is stored XSS against that operator's own
customers, and an LLM that can write page content is an LLM that can write
script tags. With a closed vocabulary the worst a bad generation produces is an
ugly page.

Enforced at the schema, before anything reaches a renderer:

- URLs must be `http(s)` — `javascript:`, `data:`, `vbscript:` and `file:` are
  rejected in every section that emits an `href` or `src`.
- Image `alt` is required, not optional. An optional field is an empty field.
- Section ids must be unique within a page; a page may hold at most 60 sections.
- Theme text/background must meet WCAG AA (4.5:1) — a *refusal*, not a warning,
  because an AI-generated palette is the likeliest source of unreadable text and
  a warning publish can ignore is how it reaches production.
- Page paths are lowercase, no trailing slash, no empty segments, and
  `/_tripistic`, `/_next`, `/api` are reserved.
- Subdomains follow DNS rules, exclude an operational deny-list, and reject
  `xn--` punycode so nobody can register a homograph of another operator's
  hostname on the shared apex.

## Tours are referenced, never copied

A `tourCards` section stores `tourIds`. Nothing about a tour — title, price,
duration, image — is written into a page. At publish, ids resolve to slugs; at
request time the Worker fetches the public tours API and renders the cards. So
editing a price in the dashboard changes the website, because the website never
had its own copy to go stale.

`bookingWidget` links into the existing booking flow. There is no second booking
engine: capacity, pricing, payment and confirmation stay in Tripistic Core.

## Templates

Seven, ordered by the workspace's business type: independent guide, walking and
city tours, adventure operator, food and culture, day trips and transfers,
multi-day tours, destination management. They differ in *composition* — which
sections and in what order — not in theme, which is a separate orthogonal set of
brand tokens.

Every template ships a homepage, a tours page, contact, terms, privacy and a
cancellation policy, and every template's own pages are validated by the same
schema an operator's edits go through (`tests/unit/site-schema.test.ts`).
Placeholder copy is written to be obviously placeholder, so an operator who
publishes without editing gets an embarrassing page rather than one that
quietly makes untrue claims about their business.

## Draft, revision, deployment

| Record | Meaning |
|---|---|
| `SitePage` | the editable draft |
| `SiteRevision` | an immutable snapshot taken at publish, with a bundle checksum |
| `SiteDeployment` | one attempt to put a revision on the edge |

Editing a draft can never change what visitors are served, because the Worker is
built from the revision.

## Rendering

`lib/sites/render.ts` turns sections into HTML at publish time, on the server.
The Worker serves the result and does not interpret section objects. Escaping is
applied to every interpolated value without exception, including inside JSON-LD
(where a `</script>` in an operator's FAQ answer would otherwise close the tag
early).

Structured data is emitted narrowly: Organization always, FAQPage only where a
section explicitly opted in, and no Tour/Product markup at all — it needs price
and availability resolved at request time, and marking up a price the page may
not be showing is the schema spam to avoid.

## The editor

`/dashboard/sites` and, per site, tabs for Overview, Editor, Pages, Brand, SEO,
Domain and Settings.

The editor is three panes: the section list (drag to reorder, add, duplicate,
hide, delete), a live preview, and the properties of whatever is selected.

**The preview is the real renderer.** `POST
/api/workspaces/{id}/sites/{siteId}/pages/{pageId}/preview` calls
`lib/sites/render.ts` — the same function the publish pipeline calls — and
returns HTML that the editor frames with `sandbox=""`. A React approximation
would be wrong in precisely the cases that matter: escaping, structured data,
the attribution footer, and every section type nobody thought to mirror.

**The properties panel is generated.** `lib/sites/section-registry.ts` carries a
field descriptor per section prop, and one renderer walks them. Thirty
hand-written panels would drift, and each drift is a section whose editor lets
you save something the schema rejects at publish. A unit test walks the real Zod
schema and fails CI if a default no longer validates, if a descriptor names a
prop that does not exist, or if a required prop has no editor field.

**History is a stack of whole documents.** A page is at most 60 sections of
bounded JSON, so snapshotting is cheap and undo across a reorder-then-edit
sequence is correct by construction. Autosave writes the draft after 1.5s idle;
it never publishes.

### Hidden sections

`hidden` on a section removes it from the rendered page entirely — the renderer
drops it rather than emitting `display:none`, so an unannounced price does not
stay readable in view-source, and it contributes no tour slots to the Worker
payload. This is distinct from `layout.visibleOn`, which hides a section at some
breakpoints and cannot express "hidden everywhere": that array requires at least
one entry, deliberately, so a section is never invisible on every device by
accident.

## Not implemented in this release

AI generation of page content. See `docs/v3/AI_ARCHITECTURE.md`.
