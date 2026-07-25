---
title: FAQ
description: Answers to the questions operators ask most often about migrating to, configuring, and running Tripistic.
eyebrow: Answers
category: Foundations
icon: help
order: 10
publishedAt: 2026-07-01
---

## Getting started

**How long does setup take?**
A single tour with payments live takes about 45 minutes. A full catalog with schedules, staff, vehicles, and automation typically takes a few days of part-time work.

**Can I import existing data?**
Yes. Customers, tours, and historical bookings can be imported via CSV or the REST API. For large migrations, contact us and we will help plan the sequence so seat accounting stays correct.

**Do I need to replace my website?**
No. Keep your site and embed the booking widget, or link to your Tripistic booking page. Operators on white-label plans can also serve booking pages from their own domain.

**Can I trial it with real bookings?**
Yes. Trials are fully functional. Connect Stripe in test mode first, verify the flow end to end, then switch to live keys.

## Bookings and payments

**What happens if two people book the last seat at the same time?**
Seats are reserved atomically. One booking succeeds, the other is rejected with a clear capacity error. Overbooking cannot occur through the interface or the API.

**Does a traveller need an account to book?**
No. Public booking is guest-friendly. They receive a confirmation link with an unguessable token to view the booking, pay, sign waivers, and see the trip timeline.

**What if a traveller pays but the booking still shows pending?**
The webhook did not reach us. Check the Stripe dashboard webhook log and resend the event. See [Payments](/docs/payments).

**Can I take deposits?**
Yes — a fixed amount or a percentage, with the balance collected later by payment link.

**Who handles traveller refunds?**
You do. Money moves through your own Stripe account under your cancellation terms. Tripistic records the refund against the booking.

## Operations

**Can guides use it on a phone?**
Yes. Manifests, check-in, departure status, and incident reporting are built for phone use in the field.

**How do I handle a delayed departure?**
Set the departure to `DELAYED`, record the reason and duration, and choose to notify booked travellers. The notice goes out automatically.

**Can I schedule drivers separately from guides?**
Yes. Guides, drivers, and vehicles are assigned independently on each departure.

**What happens if I cancel a departure?**
Every booking on it is released and you are prompted to notify affected travellers. Refunds remain your decision.

## CRM and marketing

**Is the CRM separate from bookings?**
No — that is the point. Bookings, payments, messages, waivers, and portal activity all write to the same customer timeline automatically.

**Can I send marketing emails?**
Yes, subject to consent. Consent is stored per customer with its capture timestamp and source, and unsubscribes are honoured permanently.

**Can I segment customers?**
Yes — by tag, spend, booking count, last trip date, tour, source, or company.

## AI

**What can the AI actually do?**
Generate multi-day itinerary drafts, surface business insights from your own data, answer questions via search, suggest pricing and demand actions, and summarise operational activity.

**Is my data used to train AI models?**
No. Customer content is not used to train third-party foundation models, and we require the same of our AI subprocessors.

**Can I use my own AI provider and key?**
Yes. Configure OpenAI, OpenRouter, or another supported provider in Settings → AI providers. Usage bills to your account.

**Is AI output trustworthy?**
It is advisory. Review it before sending anything to a traveller or making a commercial decision.

## Plans and billing

**Can I change plans mid-term?**
Upgrades apply immediately with a prorated charge. Downgrades apply at the next renewal.

**What counts as a seat?**
Each named member with a login. Guides who only receive manifests without logging in do not consume a seat.

**Is there an annual discount?**
Yes — annual billing saves 20%.

**What is your refund policy?**
See the [Refund Policy](/legal/refund-policy). Annual plans carry a 30-day full-refund window.

## Data, security, and compliance

**Where is my data hosted?**
Managed cloud infrastructure in the US or EU, with EU-only residency available on enterprise plans.

**Can I export everything?**
Yes, at any time. On cancellation your data stays exportable for 30 days.

**Are you GDPR compliant?**
We provide a DPA with Standard Contractual Clauses, subprocessor transparency, and data subject request support. See [GDPR Compliance](/legal/gdpr).

**Do you store card numbers?**
No. Card data goes directly to Stripe. See the [Security Policy](/legal/security-policy).

**Can I get a security review pack?**
Yes — enterprise teams can request security documentation, control summaries, and completed questionnaires via [contact](/contact).

## White label and agencies

**Can I run this under my own brand?**
Yes, on plans including white label — logo, colours, email identity, PDF branding, custom domains, and a branded portal.

**Can I manage client sub-workspaces?**
Yes, on plans including multi-tenant administration.

## Still stuck?

Search the [Help Center](/help), browse the [documentation](/docs), or [contact support](/contact).
