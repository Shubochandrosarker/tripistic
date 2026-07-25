---
title: Security Policy
description: Tripistic's encryption, backup, infrastructure, compliance, and coordinated vulnerability disclosure practices.
eyebrow: Trust & Safety
category: Security & Compliance
order: 8
publishedAt: 2026-07-01
updatedAt: 2026-07-01
---

> **Template notice.** Keep this page synchronised with your actual production controls — an inaccurate security page is a liability.

Tripistic holds traveller records, payment references, waivers, and operational data that businesses depend on. This page describes how we protect it and how to report a vulnerability.

## Encryption

- **In transit:** TLS 1.2 or higher on all public endpoints, HSTS enabled, modern cipher suites only.
- **At rest:** AES-256 encryption for the primary database, backups, and object storage.
- **Credentials:** passwords hashed with bcrypt at a work factor reviewed annually. Plaintext passwords are never stored or logged.
- **Secrets:** environment-scoped secret storage, no secrets in source control, rotation on personnel change.
- **Webhooks:** inbound Stripe webhooks are signature-verified before any state change; outbound webhooks are signed so your endpoint can verify authenticity.

## Access control and tenancy

- Role-based permissions with least privilege across owner, admin, operations, guide, and read-only roles.
- Workspace scoping enforced on every data access path and API route, so one tenant can never read another's records.
- Unique named accounts for all staff, MFA required for administrative and production access.
- Production access is limited to engineers who need it, time-bound, and logged.
- Audit logs record privileged and data-changing actions and are retained for 12 months.

## Infrastructure

- Managed cloud hosting with multi-zone redundancy and an edge network providing DDoS protection and rate limiting.
- Managed PostgreSQL with automated failover.
- Isolated environments for development, staging, and production, with no production data in lower environments.
- Infrastructure changes are code-reviewed and applied through automation, not manual console edits.

## Backups and recovery

| Control | Practice |
| --- | --- |
| Backup frequency | Automated daily full backups with continuous write-ahead logging |
| Retention | 35-day rolling window |
| Encryption | Encrypted at rest and in transit |
| Restore testing | Periodic restore drills to verify recoverability |
| Recovery point objective | 15 minutes |
| Recovery time objective | 4 hours for a full-region failure |

## Secure development

- Typed end-to-end schemas and runtime validation on all API inputs.
- Mandatory code review before merge, with automated lint, type-check, unit, integration, and end-to-end suites in CI.
- Dependency vulnerability scanning with prioritised remediation.
- Migrations reviewed for data-integrity and tenancy implications before deployment.

## Vulnerability management

| Severity | Target remediation |
| --- | --- |
| Critical | 24 hours |
| High | 7 days |
| Medium | 30 days |
| Low | 90 days or next planned release |

## Incident response

We maintain a documented incident response plan with severity classification, on-call escalation, forensic logging, and post-incident review. Where we act as a processor and a personal data breach occurs, we notify affected controllers without undue delay and within 72 hours of becoming aware, as required by our [Data Processing Agreement](/legal/data-processing-agreement).

Status and maintenance communications are described in the [Service Level Agreement](/legal/service-level-agreement).

## Compliance

- **GDPR / UK GDPR:** DPA with SCCs and the UK Addendum — see [GDPR Compliance](/legal/gdpr).
- **US state privacy laws:** see [CCPA & US State Privacy](/legal/ccpa).
- **PCI DSS:** card data is handled entirely by Stripe, a PCI DSS Level 1 service provider. Tripistic never receives or stores full card numbers, reducing our scope to SAQ-A.
- **Accessibility:** WCAG 2.2 AA target — see the [Accessibility Statement](/legal/accessibility-statement).
- **SOC 2:** our control set is built around the Trust Services Criteria. Current audit status and available reports are provided to enterprise customers under NDA via [security@tripistic.com](mailto:security@tripistic.com).

## Reporting a vulnerability

We welcome coordinated disclosure and will not pursue legal action against researchers acting in good faith under these rules.

**Email [security@tripistic.com](mailto:security@tripistic.com)** with:

1. A clear description of the issue and its impact.
2. Reproduction steps or a proof of concept.
3. Affected URLs, endpoints, or components.
4. Your preferred name for credit, if you would like it.

### Rules of engagement

**In scope:** the marketing website, the authenticated application, public booking pages, the customer portal, embeddable widgets, and the REST API.

**Out of scope:** denial-of-service and volumetric testing; social engineering of staff or customers; physical attacks; automated scanner output without a demonstrated impact; missing headers or best-practice suggestions with no exploitable consequence; issues in third-party services (report those to the vendor).

**Rules:** use only your own test accounts and data. Never access, modify, or exfiltrate another tenant's data — if you find a path to it, stop and report. Do not run destructive tests. Do not disclose publicly until we confirm a fix or 90 days have elapsed.

### Our commitments

| Stage | Target |
| --- | --- |
| Acknowledgement | 1 business day |
| Initial triage and severity assessment | 5 business days |
| Remediation plan communicated | 10 business days |
| Fix deployed | Per the severity table above |

We maintain a researcher acknowledgements page for those who want credit.
