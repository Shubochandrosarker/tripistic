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

## Not implemented in this release

The visual drag-and-drop editor. The backend, schema, templates, renderer,
publish pipeline and API are complete and tested; the dashboard UI for
composing sections is not built. See `docs/v3/FINAL_QA_REPORT.md`.
