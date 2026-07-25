---
title: Data Processing Agreement
description: The DPA governing Tripistic's processing of personal data on behalf of enterprise and operator customers, including SCCs, subprocessors, and security annexes.
eyebrow: Enterprise
category: Terms & Billing
order: 6
publishedAt: 2026-07-01
updatedAt: 2026-07-01
---

> **Template notice.** This DPA is a starting point. Enterprise customers requiring a countersigned copy or negotiated terms should contact [legal@tripistic.com](mailto:legal@tripistic.com).

This Data Processing Agreement ("DPA") forms part of the [Terms of Service](/legal/terms-of-service) between Tripistic ("Processor") and the customer ("Controller"). It applies whenever Tripistic processes personal data on the Controller's behalf. No signature is required — it is incorporated automatically when you subscribe.

## 1. Definitions

Terms including "personal data", "processing", "data subject", "controller", "processor", and "supervisory authority" have the meanings given in the GDPR. "Data Protection Laws" means the EU GDPR, UK GDPR, Swiss FADP, and applicable US state privacy laws.

## 2. Roles and scope

The Controller determines the purposes and means of processing Customer Data. Tripistic processes Customer Data only to provide the Service, in accordance with the Controller's documented instructions, and as described in Annex I. Tripistic will inform the Controller if an instruction appears to infringe Data Protection Laws.

## 3. Processor obligations

Tripistic will:

1. Process personal data only on documented instructions.
2. Ensure personnel with access are subject to confidentiality obligations.
3. Implement the technical and organisational measures in Annex II.
4. Assist the Controller in responding to data subject requests.
5. Assist with DPIAs and prior consultations, to the extent Tripistic holds the relevant information.
6. Notify the Controller without undue delay, and within 72 hours of becoming aware, of a personal data breach.
7. Delete or return personal data at the end of the engagement, except where storage is required by law.
8. Make available information necessary to demonstrate compliance and allow audits under clause 8.

## 4. Confidentiality

Tripistic will not disclose Customer Data except to personnel and subprocessors who need access to deliver the Service, or where required by law. Where legally compelled to disclose, Tripistic will notify the Controller unless prohibited.

## 5. Subprocessors

The Controller grants general authorisation for Tripistic to engage subprocessors. The current list is published in the [Privacy Policy](/legal/privacy-policy). Tripistic will:

- Impose data protection obligations on each subprocessor no less protective than this DPA.
- Give at least 30 days' notice before adding or replacing a subprocessor that processes personal data.
- Remain liable for its subprocessors' performance.

The Controller may object in writing on reasonable data-protection grounds within the notice period. If the parties cannot resolve the objection, the Controller may terminate the affected subscription without penalty for the unused prepaid term.

## 6. International transfers

Where processing involves transfer of personal data out of the EEA, UK, or Switzerland to a country without an adequacy decision, the parties incorporate:

- The Standard Contractual Clauses (Commission Decision 2021/914), Module Two (controller to processor) or Module Three (processor to processor), with the Controller as data exporter and Tripistic as data importer. Clause 7 (docking) applies; Clause 9 option 2 (general written authorisation, 30 days) applies; Clause 11 optional redress body does not apply; Clause 17 governing law and Clause 18 forum are Ireland unless the order form states otherwise.
- The UK International Data Transfer Addendum, with Tables 1–4 completed by reference to this DPA and Annexes.
- The Swiss FADP, reading references to the GDPR as references to the FADP and to the Federal Data Protection and Information Commissioner as the supervisory authority.

## 7. Security

Tripistic maintains the measures in Annex II and will not materially reduce overall security during the term. Details are published in the [Security Policy](/legal/security-policy).

## 8. Audits

On request, and no more than once per 12 months unless required by a supervisory authority, Tripistic will provide its current security documentation, control summaries, and responses to a reasonable security questionnaire. Enterprise customers may request an on-site or remote audit with 30 days' notice, at the Controller's cost, subject to confidentiality and without access to other customers' data.

## 9. Data subject requests

Tripistic provides self-service export, correction, and deletion tools. Where a data subject contacts Tripistic directly about Customer Data, Tripistic will not respond substantively but will route the request to the Controller without undue delay.

## 10. Deletion and return

On termination, Customer Data remains available for export for 30 days, then is deleted from active systems. Backup copies age out within the 35-day backup window. Tripistic will confirm deletion in writing on request.

## 11. Liability

Each party's liability under this DPA is subject to the limitation of liability in the Terms of Service, except where Data Protection Laws prohibit such limitation.

---

## Annex I — Description of processing

**Categories of data subjects:** travellers and booking participants; guardians and emergency contacts; operator staff, guides, and drivers; vendor and partner contacts; corporate and agency clients.

**Categories of personal data:** name, email, phone, address, nationality, booking and participation history, dietary and accessibility notes, emergency contacts, waiver signatures, payment status and payment intent references, guide/driver assignments and qualifications, message and notification history, portal activity.

**Special categories:** the Service is not designed for special-category data. Where operators record dietary, medical, or accessibility notes necessary for safe trip delivery, processing is limited to trip operations, and the Controller is responsible for the lawful basis.

**Nature and purpose:** hosting, storage, retrieval, transmission, and display of Customer Data to deliver bookings, payments, CRM, operations, itineraries, messaging, reporting, and AI assistance.

**Duration:** the subscription term plus the 30-day export window.

**Frequency:** continuous.

## Annex II — Technical and organisational measures

| Control area | Measures |
| --- | --- |
| Encryption | TLS 1.2+ in transit; AES-256 at rest for database and backups |
| Access control | Role-based permissions, least privilege, unique named accounts, MFA on administrative access |
| Tenant isolation | Workspace scoping enforced on every data access path and API route |
| Authentication | Hashed credentials, session rotation, CSRF protection, signed webhooks |
| Logging | Audit logs of privileged and data-changing actions, retained 12 months |
| Backups | Automated daily backups, 35-day retention, periodic restore testing |
| Secure development | Code review, dependency scanning, typed schemas, automated test suite in CI |
| Vulnerability management | Dependency patching, prioritised remediation SLAs, coordinated disclosure |
| Incident response | Documented plan, severity levels, on-call escalation, post-incident review |
| Personnel | Confidentiality agreements, background checks where lawful, security training |
| Vendor management | Due diligence and DPAs with all subprocessors |
| Business continuity | Multi-zone hosting, documented recovery objectives, tested restores |

## Annex III — Subprocessors

See the subprocessor table in the [Privacy Policy](/legal/privacy-policy), which is maintained as the authoritative list.

## Contact

[legal@tripistic.com](mailto:legal@tripistic.com) for countersigned copies or negotiated terms.
