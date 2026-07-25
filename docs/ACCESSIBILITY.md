# Accessibility

Target: **WCAG 2.2 Level AA** across the public website. This document records
what is implemented, what is verified, and what is still open.

The public-facing commitment lives at `/legal/accessibility-statement`. This
document is the engineering counterpart — keep the two consistent.

## 1. Implemented

### Structure and landmarks

- A **skip link** is the first focusable element on every page, visible on focus
  (`.skip-link` in `globals.css`), targeting `#main`.
- Every page renders `<main id="main">`, including the guest booking and
  itinerary layouts.
- `<nav>` elements carry distinguishing labels: `Primary`, `Mobile`, `Footer`,
  `Breadcrumb`, `Blog categories`, `Documentation pagination`.
- Sections use `aria-labelledby` pointing at a real heading; headings that exist
  only for structure are `sr-only`.
- One `<h1>` per page, with no skipped heading levels.

### Keyboard

- Every interactive element is reachable and operable by keyboard.
- Uniform focus indicator:
  `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`.
- `MobileNav` closes on Escape and returns focus to its trigger; opening moves
  focus to the first link.
- `ProductTour` uses proper `role="tablist"`/`tab`/`tabpanel` with
  `aria-selected` and `aria-controls`.
- The consent banner is reachable and dismissible by keyboard; it deliberately
  does not trap focus, since it is not a blocking modal.

### Colour and contrast

- Body text meets 4.5:1 in both themes; large text and UI components meet 3:1.
- The accent shifts between themes specifically to hold contrast — `#059669` at
  4.53:1 on light, `#10b981` at 6.4:1 on dark. See `DESIGN-SYSTEM.md` §1.
- **Colour is never the sole carrier of meaning.** Comparison tables pair the
  check and minus icons with `sr-only` "Included" / "Not included" text.

### Forms

- Every field has a programmatically associated `<label>` (`Field` in
  `components/ui/input.tsx`).
- Errors are text, carry `role="alert"`, and describe how to fix the problem.
- `aria-invalid` and `aria-describedby` link fields to their errors and hints.
- The contact honeypot is `hidden` and `aria-hidden` with `tabIndex={-1}` — a
  screen reader user can never be caught by it.
- Search announces result counts through a visually hidden live region.

### Motion

- Global `prefers-reduced-motion` guard in CSS, plus `useReducedMotion()` in
  every motion primitive. See `ANIMATION-GUIDE.md` §1.
- Nothing flashes more than three times per second.
- Decorative motion is `aria-hidden`.

### Content

- `.prose-content` is capped at `72ch`.
- Tables scroll inside their own container; **the page body never scrolls
  horizontally**.
- Table headers use `<th scope>`; comparison tables carry an `sr-only`
  `<caption>`.
- Every image in the media library requires alt text as a data field.
- `ScreenshotFrame` uses real text, so interface previews are readable by screen
  readers rather than being an opaque image.

### Responsive

- Usable at 320px width and at 200% zoom without loss of content or function.
- Touch targets meet the WCAG 2.2 minimum.

### WCAG 2.2 specifics

| Criterion | Status |
| --- | --- |
| 2.4.11 Focus Not Obscured (Minimum) | Sticky header is 4rem; `scroll-margin-top: 6rem` on headings keeps anchor targets clear |
| 2.5.7 Dragging Movements | No drag-only interaction exists |
| 2.5.8 Target Size (Minimum) | Controls meet the 24×24 minimum |
| 3.3.7 Redundant Entry | No public flow asks for the same information twice |
| 3.3.8 Accessible Authentication | No cognitive function test; password managers work normally |

## 2. Verification status

**Verified by construction and code review** — the implementation list above was
built to the standard and reviewed against it.

**Not yet verified by testing.** The following require a running deployment and
have not been performed:

- [ ] Automated axe / Lighthouse accessibility audit on the deployed build
- [ ] Manual keyboard pass on every page template
- [ ] NVDA + Firefox screen reader pass
- [ ] VoiceOver + Safari pass (macOS and iOS)
- [ ] TalkBack + Chrome pass on Android
- [ ] 200% zoom and 320px reflow verification on real devices
- [ ] Contrast verification with a sampling tool against rendered output
- [ ] Third-party audit

Do not claim conformance publicly beyond "partially conformant" until the manual
passes above are complete. The accessibility statement is written accordingly.

## 3. Known limitations

| Area | Limitation | Plan |
| --- | --- | --- |
| Interface previews | Convey layout visually; the text within is readable but spatial relationships are not described | Add descriptive summaries where the layout itself carries meaning |
| Third-party embeds | Stripe, Google Maps, and video players are governed by their vendors | Track vendor conformance; provide non-visual alternatives |
| Consent banner | Not focus-trapped by design, since it is non-blocking | Intentional — revisit if it becomes modal |
| Contact map | Placeholder with `role="img"` and a descriptive label | Real embed will need its own accessible alternative |

## 4. Testing procedure

### Every pull request

1. Tab through the changed page start to finish. Every stop must be visible and
   the order logical.
2. Zoom to 200%. Nothing clipped, nothing overlapping.
3. Narrow to 320px. No horizontal page scroll.
4. Toggle both themes and check contrast on any new colour pairing.
5. Enable reduced motion at the OS level and confirm the page is still complete
   and usable.

### Every release

1. Run axe DevTools on one page of each template type.
2. Run Lighthouse accessibility on home, pricing, a docs page, and a blog post.
3. Screen-reader pass on any new interactive component.

### Templates to cover

Home · feature detail · solution detail · pricing · demo · docs index · docs
detail · help index · help detail · blog index · blog post · legal detail ·
developers · contact.

## 5. Rules for new work

1. Semantic HTML first. ARIA only when no native element expresses the pattern.
2. Every interactive element gets a visible focus state — no exceptions.
3. Every form field gets a real label. Placeholders are not labels.
4. Every error is text, announced, and explains the fix.
5. Colour never carries meaning alone.
6. Every animation respects reduced motion.
7. Every image has alt text; decorative images are `aria-hidden`.
8. Test with a keyboard before opening the pull request.

## 6. Feedback

Accessibility reports go to `support@tripistic.com` with the subject
"Accessibility". Acknowledged within 2 business days, assessed within 10, and
blocking barriers prioritised into the next release. The commitment is published
at `/legal/accessibility-statement` — if these targets change, change both.
