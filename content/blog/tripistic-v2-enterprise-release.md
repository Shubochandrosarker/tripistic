---
title: Tripistic v2.0.0 — the enterprise foundation release
description: White label, custom domains, the customer portal, super-admin platform controls, and AI provider governance are now available.
category: Product Updates
tags: [release, white label, enterprise, product]
author: Tripistic Team
authorRole: Product
publishedAt: 2026-06-18
---

Tripistic v2.0.0 is the release where the platform stops being a tool one operator uses and becomes infrastructure an agency, DMC, or reseller can build a business on.

Here is what shipped and why it matters.

## White label

Agencies and DMCs have always faced the same problem: their client experience is only as good as the most generic tool in the chain. A beautifully run trip that ends with a confirmation email carrying someone else's logo undercuts the whole relationship.

v2 adds brand kits that apply across the surfaces clients actually see:

- The operator application.
- The customer portal.
- Public booking pages.
- Transactional emails.
- Generated PDFs and invoices.
- API brand metadata for anything you build yourself.

Not a logo swap on one screen — a consistent brand across every touchpoint.

## Custom domains

White label without your own domain is half a solution. v2 adds domain records with DNS verification, SSL issuance tracking, and ongoing health monitoring, so booking pages and portals can be served from hostnames you own.

The health monitoring matters more than it sounds. Custom domains fail quietly — a DNS change, an expired certificate, a registrar migration — and you find out when a client asks why their booking page is showing a warning. Continuous checks surface that before they do.

## The customer portal

Travellers now have a real self-service surface: bookings, invoices, payments, documents, messaging, trip timeline, and notifications, all branded to the operator or agency.

The immediate effect is on support volume. "Where is my confirmation", "can I get a copy of the invoice", "what time is the pickup" are the three most common inbound messages in travel operations, and all three are now self-service.

## Super-admin platform layer

For organisations running Tripistic as a platform rather than a single business, v2 adds an administrative layer above individual workspaces:

- Workspace provisioning and lifecycle.
- Plan assignment and revenue overview.
- White-label brand kit management across tenants.
- Custom domain verification and health.
- AI provider governance.
- System health monitoring and maintenance mode.

This is the layer that makes a reseller model practical.

## AI provider governance

AI features are only adoptable in regulated or enterprise contexts if someone can answer "which provider processes our data, on which model, under whose contract." v2 makes provider and model configuration explicit and centrally governable, with your own API keys, so usage bills to your account and the data path is one you control.

## Hardening

Less visible, more important:

- **Workspace scoping enforced on every data access path and API route.** Tenant isolation is now a property of the query layer, not a convention.
- **Booking confirmation depends solely on the verified Stripe webhook.** A traveller who closes the tab immediately after paying still gets a confirmed booking and their email.
- **Pending payment expiry moved to a scheduled sweep**, so abandoned checkouts reliably release the seats they were holding.
- **Audit log surfaces** for owners and admins covering privileged and data-changing actions.

## Upgrading

For self-hosted and enterprise deployments:

1. Run `prisma migrate deploy` before starting the new build.
2. Re-copy your Stripe webhook signing secret if environments were rotated.
3. **Review member roles.** The Operations role no longer includes settings access that previously fell under a broader admin grouping. Anyone who genuinely needs settings access should be an Admin.

Full detail in the [release notes](/docs/release-notes).

## What is next

The [public roadmap](/roadmap) is the current source of truth, and it is open for voting. The themes we are working on: deeper channel management, richer group-payment handling, and expanded reporting.

---

**Related:** [White Label](/white-label) · [Customer Portal](/customer-portal) · [Changelog](/changelog) · [Roadmap](/roadmap)
