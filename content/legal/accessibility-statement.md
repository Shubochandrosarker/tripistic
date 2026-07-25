---
title: Accessibility Statement
description: Tripistic's WCAG 2.2 AA commitment, current conformance status, known limitations, assistive technology support, and how to report a barrier.
eyebrow: Inclusion
category: Product & IP
order: 12
publishedAt: 2026-07-01
updatedAt: 2026-07-01
---

Tripistic is used by guides, drivers, office staff, and travellers with a wide range of abilities and devices. Accessibility is a product requirement, not an afterthought.

## Our commitment

We design, build, and test Tripistic against the **Web Content Accessibility Guidelines (WCAG) 2.2 Level AA**. That commitment covers the marketing website, the authenticated application, public booking pages, the customer portal, and email templates.

## Conformance status

**Partially conformant with WCAG 2.2 Level AA.** "Partially conformant" means most of the platform meets the standard and known exceptions are listed below with remediation plans.

We reassess conformance each release cycle and after any significant interface change.

## What we have implemented

### Perceivable

- Text and interactive elements meet a minimum 4.5:1 contrast ratio in both light and dark themes; large text and UI components meet 3:1.
- Colour is never the only means of conveying status — booking, payment, and operational states pair colour with a text label or icon.
- All meaningful images carry alternative text; decorative graphics are hidden from assistive technology.
- Content reflows to a 320 CSS pixel viewport without horizontal scrolling, and remains usable at 200% zoom.
- Wide content such as comparison tables and code blocks scrolls within its own container rather than breaking the page.

### Operable

- Every interactive element is reachable and usable with a keyboard alone, in a logical order.
- Visible focus indicators on all focusable elements, in both themes.
- A "Skip to content" link is the first focusable element on every page.
- No keyboard traps; dialogs return focus to their trigger on close.
- Animation respects `prefers-reduced-motion` — motion is reduced to a simple fade or removed entirely.
- No content flashes more than three times per second.
- Target sizes meet the WCAG 2.2 minimum for touch interaction.

### Understandable

- The page language is declared, and headings follow a single logical hierarchy.
- Form fields have programmatically associated labels; errors are described in text, announced to assistive technology, and explain how to fix the problem.
- Navigation, terminology, and component behaviour are consistent across the platform.
- Authentication does not depend on a cognitive function test such as transcribing a distorted image.

### Robust

- Semantic HTML with ARIA used only where a native element cannot express the pattern.
- Live regions announce asynchronous updates such as save confirmations and operational status changes.
- Tested against current versions of major browsers and screen readers.

## Assistive technology support

We test with:

| Assistive technology | Platform |
| --- | --- |
| NVDA | Windows / Firefox and Chrome |
| JAWS | Windows / Chrome |
| VoiceOver | macOS Safari, iOS Safari |
| TalkBack | Android Chrome |
| Keyboard-only navigation | All platforms |
| Browser zoom to 200% and OS text scaling | All platforms |

## Known limitations

| Area | Limitation | Plan |
| --- | --- | --- |
| Analytics charts | Trend visualisations convey shape graphically; an accessible data table accompanies each chart, but complex comparisons remain easier visually | Expanding tabular alternatives and text summaries |
| Third-party embeds | Stripe Checkout, Google Maps, and embedded video players are governed by their vendors' accessibility support | Tracking vendor conformance; providing non-visual alternatives where possible |
| Operator-authored content | Tour descriptions, images, and documents uploaded by operators may lack alternative text | In-product guidance and alt-text prompts on upload |
| Legacy PDF documents | Some generated PDFs are not fully tagged | Tagged-PDF output planned |

## Assessment approach

We combine automated testing in CI, manual keyboard and screen-reader passes on primary flows, contrast verification of every design token pair, and review of new components against a per-component accessibility checklist. We supplement internal testing with periodic third-party audits.

## Feedback and enforcement

If you encounter a barrier, tell us — accessibility reports are prioritised.

**Email [support@tripistic.com](mailto:support@tripistic.com)** with the subject line "Accessibility", and include the page or feature, what you were trying to do, your browser and assistive technology, and the barrier you hit.

| Stage | Target |
| --- | --- |
| Acknowledgement | 2 business days |
| Assessment and plan | 10 business days |
| Fix for a blocking barrier | Prioritised into the next release |

If you are not satisfied with our response, you may escalate to [legal@tripistic.com](mailto:legal@tripistic.com). We will also provide information in an alternative format on request.

## Standards referenced

- WCAG 2.2 Level AA (primary target)
- EN 301 549 (European accessibility requirements for ICT)
- Section 508 of the US Rehabilitation Act
- European Accessibility Act, for services in scope
