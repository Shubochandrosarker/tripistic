# Page Sitemap

Every public route on the Tripistic marketing website, with its rendering mode
and purpose. Authenticated routes (`/dashboard/*`, `/admin/*`, `/workspaces/*`)
are out of scope and excluded from the XML sitemap.

**Total public pages: 100** — 27 static routes plus 73 generated from data.

## Core

| Route | Mode | Purpose |
| --- | --- | --- |
| `/` | Static | Hero, platform pillars, product preview, features, solutions, testimonials, trust, pricing preview, FAQ, CTA |
| `/features` | Static | All 17 capabilities |
| `/features/[slug]` | SSG × 17 | Per-capability detail: description, interface preview, benefits, related features, CTA |
| `/solutions` | Static | All 13 verticals |
| `/solutions/[slug]` | SSG × 13 | Challenges, solution, benefits, case study, metrics, CTA |
| `/pricing` | Static | Plans, interval toggle, comparison matrix, ROI calculator, FAQ |
| `/demo` | Static | Interactive product tour, videos, live demo booking, FAQ |
| `/why-tripistic` | Static | 12-dimension competitor comparison |

### Feature pages (17)

`bookings` · `crm` · `ai` · `tours` · `guides` · `drivers` · `vehicles` ·
`operations` · `marketing` · `reports` · `white-label` · `custom-domains` ·
`customer-portal` · `payments` · `automation` · `analytics` · `integrations`

### Solution pages (13)

`tour-operators` · `travel-agencies` · `destination-management-companies` ·
`adventure-tours` · `city-tours` · `private-tours` · `multi-day-tours` ·
`corporate-tours` · `luxury-travel` · `group-travel` · `educational-tours` ·
`government-tourism` · `enterprise`

## Platform detail

| Route | Mode | Purpose |
| --- | --- | --- |
| `/ai-platform` | Static | Copilot, search, scheduling, reports, itinerary builder, insights, knowledge base, automation |
| `/white-label` | Static | Agency branding, custom domains, logos, emails, portal, multi-tenant, reseller |
| `/customer-portal` | Static | Bookings, invoices, documents, payments, chat, trip timeline, notifications, mobile |
| `/integrations` | Static | Stripe, Maps, Calendar, Twilio, WhatsApp, OpenAI, OpenRouter, Cloudflare, n8n, Zapier, webhooks, REST API |

## Developers

| Route | Mode | Purpose |
| --- | --- | --- |
| `/developers` | Static | Quickstart, platform highlights, reference index |
| `/developers/authentication` | SSG | Tokens, scoping, rotation, public tokens |
| `/developers/rest-api` | SSG | Resources, pagination, filtering, idempotency, errors |
| `/developers/webhooks` | SSG | Event catalog, HMAC verification, retries, ordering |
| `/developers/rate-limits` | SSG | Quotas, headers, backoff, design guidance |
| `/developers/sdk` | SSG | Client generation and a hand-rolled TypeScript client |
| `/developers/examples` | SSG | Seven working integration recipes |
| `/developers/openapi` | SSG | Using the specification for clients, mocks, contract tests |
| `/openapi.json` | Static asset | OpenAPI 3.1 document |

## Documentation (12)

`/docs` plus `/docs/[slug]`:

`getting-started` · `bookings` · `crm` · `tours` · `payments` · `users` ·
`permissions` · `integrations` · `api` · `faq` · `videos` · `release-notes`

Grouped as **Foundations**, **Operations**, **Administration**, **Platform**.

## Help Center (12)

`/help` plus `/help/[slug]`, grouped by category:

| Category | Articles |
| --- | --- |
| Getting Started | `create-your-first-tour`, `connect-stripe` |
| Bookings & Payments | `cancel-or-move-a-booking` |
| Operations | `assign-guides-and-vehicles`, `handle-a-delayed-departure` |
| Account & Billing | `invite-team-members`, `export-your-data`, `set-up-white-label-branding`, `manage-billing-and-plans` |
| Troubleshooting | `payment-not-showing`, `booking-page-not-showing-dates`, `emails-not-arriving` |

## Blog (9 posts + 9 category archives)

`/blog`, `/blog/[slug]`, `/blog/category/[category]`.

| Category | Post |
| --- | --- |
| AI | `ai-tour-operator-back-office` |
| Growth | `direct-booking-playbook` |
| Automation | `automation-workflows-that-pay-for-themselves` |
| Travel Technology | `travel-technology-stack-2026` |
| Marketing | `marketing-channels-for-tour-operators` |
| Operations | `operations-checklist-peak-season` |
| Product Updates | `tripistic-v2-enterprise-release` |
| Case Studies | `dmc-case-study-multi-vendor-operations` |
| Industry News | `travel-industry-outlook-2026` |

## Company

| Route | Purpose |
| --- | --- |
| `/about` | Mission, vision, story, leadership, values, timeline |
| `/customers` | Case studies, testimonials, ROI, growth metrics |
| `/partners` | Technology, integration, travel, agency partners, affiliate program |
| `/careers` | Culture, open positions, benefits, remote work |
| `/contact` | Interactive form routed by reason, contact channels, location |
| `/changelog` | Version history and release notes |
| `/roadmap` | Planned, in progress, released, voting |

## Legal (13)

`/legal` plus `/legal/[slug]`:

| Category | Documents |
| --- | --- |
| Privacy & Data | `privacy-policy`, `cookie-policy`, `gdpr`, `ccpa` |
| Terms & Billing | `terms-of-service`, `data-processing-agreement`, `refund-policy` |
| Security & Compliance | `acceptable-use-policy`, `security-policy`, `service-level-agreement` |
| Product & IP | `license-agreement`, `accessibility-statement`, `copyright-policy` |

## Machine-readable

| Route | Purpose |
| --- | --- |
| `/sitemap.xml` | Generated from routes + content, with per-document `lastModified` |
| `/robots.txt` | Disallows authenticated, API, and guest-token routes |
| `/llms.txt` | Grouped link map for LLM crawlers |
| `/openapi.json` | API contract |
| `/og?title=…` | Generated social cards |

## Auth entry points (public, excluded from sitemap)

`/login` · `/register` — linked from every marketing page header and CTA.

## Excluded from indexing

`/dashboard/*` · `/admin/*` · `/api/*` · `/og` · `/book/confirmation/*` ·
`/itinerary/*` · `/invite/*` · `/unsubscribe/*` · `/workspaces/*`

Guest-token URLs are excluded because the token is the credential — indexing one
would expose a booking.

## Internal linking

Every page links up to its section index and across to siblings. Feature pages
cross-link related features; solution pages cross-link other verticals; content
pages carry prev/next and "keep reading"; the footer links all five groups from
every page. No public page is more than two clicks from the home page.
