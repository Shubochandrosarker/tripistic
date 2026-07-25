# Legal Pages

Inventory, structure, and maintenance process for the 13 legal documents at
`/legal`.

> **All 13 documents are production-ready templates, not legal advice.** Each
> one carries a visible template notice recommending review by qualified counsel
> in your operating jurisdictions. They are drafted to be substantively complete
> and internally consistent so that legal review is an edit rather than a
> rewrite — but the review is not optional before these become binding.

## 1. Inventory

| Document | Slug | Category | Covers |
| --- | --- | --- | --- |
| Privacy Policy | `privacy-policy` | Privacy & Data | Controller/processor roles, data collected, legal bases, cookies, subprocessors, transfers, retention schedule, rights, children, security, contact |
| Cookie Policy | `cookie-policy` | Privacy & Data | Four categories, named cookies with durations, vendor tables, consent capture, Global Privacy Control, changing consent |
| GDPR Compliance | `gdpr` | Privacy & Data | Roles, lawful bases, Article 15–22 rights mapping, Article 30 records, SCCs and UK Addendum, subprocessors, 72-hour breach notification, DPIA support |
| CCPA & US State Privacy | `ccpa` | Privacy & Data | Notice at collection table, no-sale/no-share position, rights, verification, appeals, retention, GPC |
| Terms of Service | `terms-of-service` | Terms & Billing | Service, accounts, subscriptions, billing, traveller payments, customer data, AI features, restrictions, IP, SLA reference, refunds, termination, warranties, liability, indemnity, governing law |
| Data Processing Agreement | `data-processing-agreement` | Terms & Billing | Roles, processor obligations, subprocessors, transfers with SCC module selection, security, audits, DSR handling, deletion, plus Annex I (processing description), Annex II (TOMs), Annex III (subprocessors) |
| Refund Policy | `refund-policy` | Terms & Billing | Subscription vs traveller refunds, trials, monthly, annual, enterprise, downgrades, exclusions, statutory rights, process, chargebacks |
| Acceptable Use Policy | `acceptable-use-policy` | Security & Compliance | Security, spam and messaging consent, abuse, illegal content, automation and AI use, resource use, reseller obligations, enforcement ladder, reporting |
| Security Policy | `security-policy` | Security & Compliance | Encryption, access control, tenant isolation, infrastructure, backups with RPO/RTO, secure development, remediation SLAs, incident response, compliance posture, coordinated disclosure with scope and response targets |
| Service Level Agreement | `service-level-agreement` | Security & Compliance | Uptime targets by plan, measurement method, exclusions, support channels and response times, severity definitions, service credit table, claims process, maintenance, status communication |
| License Agreement | `license-agreement` | Product & IP | Subscription licence, seats, reserved rights, customer data, white-label licence and conditions, reseller licence, API licence, restrictions, third-party components, feedback, trademarks, term, audit |
| Accessibility Statement | `accessibility-statement` | Product & IP | WCAG 2.2 AA commitment, conformance status, implemented measures by POUR principle, assistive technology matrix, known limitations, assessment approach, feedback with response targets, standards referenced |
| Copyright Policy | `copyright-policy` | Product & IP | DMCA notice requirements, response timeline, counter-notice procedure, trademark complaints, repeat-infringer ladder, AI-generated content responsibility |

## 2. Coverage against the brief

The brief listed GDPR, CCPA, cookie usage, analytics, data retention, user
rights, and contact information as requirements. Cookie usage, analytics,
retention, rights, and contact are sections **within** the Privacy Policy, as
the brief structured them. GDPR and CCPA are additionally given **dedicated
pages** because they carry independent search intent and are frequently
requested by name during procurement.

DMCA is covered as the core of the Copyright Policy rather than as a separate
page, for the same structural reason.

## 3. How they are built

Legal documents are markdown in `content/legal/`, rendered by `/legal/[slug]`.
Each page provides:

- Breadcrumbs and `Article` + `WebPage` structured data
- Table of contents from the document's own headings
- Both an effective date (`publishedAt`) and a last-updated date (`updatedAt`)
- Reading time
- Related documents from the same category
- A contact block routing to `legal@tripistic.com`

The `/legal` index groups all 13 by category and surfaces the four compliance
badges plus a procurement contact block.

## 4. Cross-references

The documents reference each other deliberately, and those links must stay
valid. The main dependencies:

- **Terms of Service** → DPA, AUP, SLA, Refund Policy, License Agreement
- **Privacy Policy** → Cookie Policy, GDPR, CCPA, DPA, Security Policy
- **GDPR** → DPA, Privacy Policy, Security Policy
- **DPA** → Privacy Policy (authoritative subprocessor list), Security Policy
- **SLA** → Terms of Service, Security Policy
- **Security Policy** → DPA, SLA, GDPR, CCPA, Accessibility Statement
- **AUP** → Terms of Service, Security Policy, Copyright Policy, License Agreement

The subprocessor table lives in **one place** — the Privacy Policy — and the DPA
Annex III points at it. Do not duplicate it, or the two will drift.

## 5. Consistency requirements

These values appear in more than one document and **must agree**:

| Value | Documents |
| --- | --- |
| 30-day data export window after cancellation | Privacy, Terms, DPA, Refund, help article |
| 35-day backup retention | Privacy, DPA Annex II, Security |
| 72-hour breach notification | Privacy, GDPR, DPA, Security |
| 12-month audit log retention | Privacy, DPA Annex II, Security |
| 12-month consent cookie lifetime | Cookie Policy, `lib/analytics/events.ts` |
| Uptime targets by plan | SLA, pricing comparison table |
| Support response times by plan | SLA, pricing comparison table |
| Annual refund window (30 days) | Refund Policy, pricing FAQ |
| WCAG 2.2 AA target | Accessibility Statement, `ACCESSIBILITY.md` |
| RPO 15 min / RTO 4 hours | Security Policy, SLA |

**When you change one, grep for the others.** An SLA that promises 99.9% while
the pricing table says 99.5% is a contractual problem, not a typo.

## 6. Before going live

- [ ] Full review by qualified counsel in every jurisdiction you sell into.
- [ ] Remove the template notices once reviewed.
- [ ] Insert the real registered entity name, company number, and postal address.
- [ ] Appoint and name EU and UK data protection representatives if required.
- [ ] Register a DMCA designated agent with the US Copyright Office and insert
      the real agent details in the Copyright Policy.
- [ ] Verify the subprocessor list against what production actually uses.
- [ ] Confirm the SLA targets are ones your infrastructure and support rota can
      sustain — an aspirational SLA is a liability.
- [ ] Confirm the Security Policy describes real controls. An inaccurate security
      page is the most dangerous document on this list.
- [ ] Set the governing law and jurisdiction in the Terms of Service.
- [ ] Confirm the SCC module selection and clause options in the DPA.
- [ ] Complete the manual accessibility testing before the Accessibility
      Statement's conformance claim is relied upon.

## 7. Maintenance

| Trigger | Action |
| --- | --- |
| New subprocessor | Update the Privacy Policy table, give administrators 30 days' notice as the DPA requires |
| Pricing or plan change | Update SLA targets and the pricing comparison together |
| New data category collected | Update Privacy Policy, CCPA notice at collection, and DPA Annex I |
| Security control change | Update Security Policy and DPA Annex II |
| Any material change | Bump `updatedAt`; notify administrators where the document promises notice |
| Quarterly | Review all 13 for drift against actual practice |
| Annually | Full counsel review |

Update `updatedAt` in frontmatter for every material change — it drives the
displayed date, the sitemap `lastModified`, and the `dateModified` in structured
data.
