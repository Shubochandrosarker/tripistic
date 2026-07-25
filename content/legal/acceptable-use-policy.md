---
title: Acceptable Use Policy
description: Security, spam, abuse, illegal content, and automation rules that govern every Tripistic workspace, API key, and white-label deployment.
eyebrow: Trust & Safety
category: Security & Compliance
order: 7
publishedAt: 2026-07-01
updatedAt: 2026-07-01
---

> **Template notice.** Review enforcement steps and escalation contacts with counsel before publishing.

This Acceptable Use Policy ("AUP") applies to everyone using Tripistic — account owners, workspace members, API consumers, white-label resellers, and end travellers using the customer portal. It forms part of the [Terms of Service](/legal/terms-of-service).

## 1. Security

You must not:

- Attempt to gain unauthorised access to any account, workspace, database, or system.
- Probe, scan, or test the vulnerability of the Service without prior written authorisation. Authorised research is welcome under the process in our [Security Policy](/legal/security-policy).
- Circumvent authentication, rate limits, quotas, billing controls, or tenant isolation.
- Intercept or modify data in transit that you are not authorised to access.
- Upload or transmit malware, ransomware, exploit code, or credential-harvesting content.
- Share credentials, API keys, or session tokens with unauthorised parties, or embed secret keys in client-side code.

Report suspected vulnerabilities to [security@tripistic.com](mailto:security@tripistic.com).

## 2. Spam and messaging

Tripistic sends booking confirmations, reminders, review requests, departure notices, and operator-authored messages. You must:

- Only message travellers with a lawful basis or consent, as required by GDPR, PECR, CAN-SPAM, CASL, and the TCPA.
- Include accurate sender identity and a working unsubscribe mechanism in marketing messages.
- Honour unsubscribe and opt-out requests promptly, and never re-add a contact who has opted out.
- Respect quiet hours and jurisdictional restrictions for SMS and WhatsApp messaging.
- Never purchase, scrape, or upload contact lists you did not collect lawfully.

Transactional messages tied to a real booking are not marketing. Using transactional templates to deliver promotional content is a breach of this AUP.

## 3. Abuse and harmful conduct

You must not use Tripistic to harass, threaten, defame, stalk, doxx, or discriminate against any person, including travellers, guides, drivers, vendors, or our staff. Workspace owners are responsible for the conduct of members they invite.

## 4. Illegal content and activity

You must not use the Service to facilitate:

- Human trafficking, forced labour, or exploitation of any kind — including any use of the participant, itinerary, or transport features to that end.
- The sale of travel or activities that are unlawful in the jurisdiction of delivery.
- Wildlife exploitation prohibited by CITES or local law.
- Sanctions evasion, money laundering, terrorism financing, or transactions with sanctioned parties.
- Fraudulent bookings, fake reviews, chargeback fraud, or misrepresentation of what a traveller is buying.
- Distribution of child sexual abuse material or non-consensual intimate imagery. Such content is reported to the relevant authorities immediately.
- Infringement of copyright, trademark, or other intellectual property. See the [Copyright Policy](/legal/copyright-policy).

## 5. Automation, API, and AI use

- Respect published rate limits. Back off on `429` responses rather than retrying immediately.
- Do not use the API for systematic bulk extraction of data beyond your own workspace's records.
- Do not automate account creation, trial abuse, or credential stuffing.
- Do not present AI-generated itineraries, pricing, or insights to travellers as verified fact without human review. You are responsible for the accuracy of what you publish.
- Do not use AI features to generate deceptive reviews, impersonate a real person, or produce content that violates this AUP.
- Webhook endpoints you register must verify our signature and must not be used to relay traffic to third parties.

## 6. Resource use

Do not consume resources in a way that degrades service for others: uncontrolled polling loops, unbounded exports, recursive webhook chains, or deliberately expensive AI request patterns. We may apply fair-use limits and will contact you before restricting a legitimate high-volume workload.

## 7. White label and reseller obligations

If you resell Tripistic under your own brand, you remain responsible for your sub-customers' compliance with this AUP, for your own privacy notices and support obligations, and for the lawful basis of all data you load. See the [License Agreement](/legal/license-agreement).

## 8. Enforcement

We investigate reported and detected violations proportionately. Depending on severity we may:

1. Contact you and request remediation.
2. Restrict a specific feature, API key, or sending capability.
3. Suspend the workspace.
4. Terminate the subscription under the Terms of Service.
5. Preserve evidence and report to law enforcement where legally required.

For severe violations — CSAM, active attacks, trafficking, imminent risk to safety — we act immediately without prior notice.

## 9. Reporting a violation

Email [security@tripistic.com](mailto:security@tripistic.com) for security issues, or [legal@tripistic.com](mailto:legal@tripistic.com) for abuse, spam, and content reports. Include the workspace, URLs, timestamps, and evidence. We acknowledge reports within one business day.
