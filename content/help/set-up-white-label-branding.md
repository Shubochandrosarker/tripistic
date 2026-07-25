---
title: How do I set up white-label branding and a custom domain?
description: Apply your brand kit across the app, portal, emails, and PDFs, then serve booking pages from your own domain.
category: Account & Billing
tags: [white label, branding, custom domain, dns]
order: 11
publishedAt: 2026-07-01
---

White label is available on Agency, Enterprise, and reseller plans.

## Apply a brand kit

1. Go to **Settings → Branding**.
2. Upload your logo — SVG preferred, or PNG at 2x resolution.
3. Set your primary colour. Tripistic derives light and dark variants automatically.
4. Set the sender name and reply-to address for emails.
5. Upload a PDF header for invoices and vouchers.
6. Save and preview.

The brand applies to the operator application, customer portal, public booking pages, transactional emails, generated PDFs, and API brand metadata.

**Check the contrast.** A brand colour that fails contrast against white text is legible in your mockup and unreadable on a phone in sunlight. The preview flags combinations that fall below the WCAG threshold.

## Add a custom domain

1. Go to **Settings → Domains → Add domain**.
2. Enter the hostname — typically `book.yourbrand.com`.
3. Create the DNS records shown at your DNS provider.
4. Wait for verification. DNS propagation usually takes minutes but can take up to 24 hours.
5. SSL is issued automatically once verification succeeds.

## Domain status reference

| Status | Meaning |
| --- | --- |
| Pending verification | Records not yet visible to us |
| Verified | DNS correct, certificate issuing |
| Active | Live and serving traffic |
| Failed | Records missing, incorrect, or conflicting |
| Unhealthy | Was active, now failing checks |

**Unhealthy** usually means a DNS change elsewhere, a registrar migration, or a conflicting record added by another service. Custom domains fail quietly, which is why health is monitored continuously rather than only at setup.

## Email sending domain

To send from your own domain, publish SPF, DKIM, and DMARC records as shown in **Settings → Branding → Email**. Without them, mailbox providers filter your confirmations aggressively.

## Sub-workspaces for clients

On plans with multi-tenant administration you can provision sub-workspaces for clients, each with its own brand kit and domain. You remain responsible for your clients' compliance and are their first line of support — see the [License Agreement](/legal/license-agreement).

## Related

- [White Label](/white-label) · [Users & Teams](/docs/users) · [Integrations](/docs/integrations)
