# Animation Guide

Motion on the Tripistic website exists to explain state and guide attention.
Anything that does not do one of those two things is decoration, and decoration
costs performance and accessibility.

## 1. The non-negotiable rule

**Every animation must respect `prefers-reduced-motion`.**

Two layers enforce this:

1. A global CSS guard in `app/globals.css` collapses all CSS animations and
   transitions to ~0ms.
2. Every component in `components/marketing/motion.tsx` calls
   `useReducedMotion()` and returns a static render.

The CSS guard alone is not enough — Framer Motion animates via inline transforms
that CSS cannot override. Both layers are required.

```tsx
const reduced = useReducedMotion();
if (reduced) return <>{children}</>;
```

Reduced motion means *reduced*, not *broken*. A `Counter` under reduced motion
shows its final value immediately. A `PageTransition` renders children directly.
The user never loses information.

## 2. Timing

| Interaction | Duration | Easing |
| --- | --- | --- |
| Hover, focus, colour | 150ms | default |
| Card lift | 150ms | default |
| Scroll reveal | 450–550ms | `easeOut` |
| Stagger between items | 30–60ms | — |
| Page transition | 280ms | `easeOut` |
| Counter | 1400ms | `easeOutCubic` |
| Ambient gradient | 18–22s | `easeInOut`, infinite |

**Rules of thumb.** Under 100ms is not perceived as motion. Over 600ms for a UI
response feels broken. Entrances can be slower than exits — an exit should get
out of the way.

Always `easeOut` for entrances: fast start, gentle settle. Never `linear` for
anything a user watches — it reads as mechanical.

## 3. The primitives

### `AnimatedReveal`

Fade and lift on scroll. `viewport={{ once: true }}` — content must never
re-animate when scrolled past twice.

```tsx
<AnimatedReveal delay={Math.min(index * 0.03, 0.18)}>
  <Card />
</AnimatedReveal>
```

**Cap the delay.** `index * 0.03` on a 20-item grid means the last card waits
600ms. `Math.min(index * 0.03, 0.18)` keeps the sequence readable without making
anyone wait.

### `StaggerGroup` / `StaggerItem`

Parent-orchestrated sequencing. Use when a group should feel like one gesture —
pricing cards, a feature row. `AnimatedReveal` is right for a single element.

### `Counter`

Counts up on entering view, using `requestAnimationFrame` with `easeOutCubic`.
Reserve space for the final width or the layout shifts as digits grow.

Use for figures the user should register — ROI results, platform stats. Do not
animate every number on a page; if everything counts, nothing stands out.

### `Parallax`

Small vertical offset (±40px default) tied to scroll progress. Two rules:
**decorative or secondary content only**, and **keep the distance small**. Large
parallax causes motion discomfort and pushes content out of the viewport at
awkward scroll positions.

### `GradientBackdrop`

Two blurred accent orbs drifting on 18–22s loops. Always `aria-hidden`.

Use at most once per page, behind a hero or major section. Blur is
GPU-expensive; several instances degrade scroll performance on mid-range mobile.

### `PageTransition`

280ms fade-and-lift on route change. Keep it short — anything longer makes
navigation feel slower than it is, which is the opposite of the intent.

### `ScrollProgress`

Spring-smoothed reading progress bar for long documents. Hidden entirely under
reduced motion.

### `LoadingShimmer`

CSS-keyframe placeholder carrying `role="status"` and `aria-label="Loading"`, so
the state is announced rather than only shown.

## 4. Hover and micro-interactions

The standard interactive card:

```
transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md
```

A 2px lift is enough. Larger movement causes the pointer to fall outside the
element and flicker between states.

Directional affordance — arrows that advance on hover:

```tsx
<ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
```

**Hover is not the only state.** Everything with a hover state needs a matching
`focus-visible` state, or keyboard users get no feedback at all.

## 5. What not to animate

| Never | Why |
| --- | --- |
| Body text on entrance | Delays reading for no benefit |
| Anything above the fold on first paint | Hurts LCP and looks slow |
| Form validation errors | Errors must be immediate and obvious |
| More than three things at once in one viewport | Nothing to look at is the same as everywhere to look |
| Anything flashing more than 3×/second | WCAG 2.3.1 seizure risk |
| Layout-affecting properties in a loop | `width`/`height`/`top` force reflow — use `transform` and `opacity` |

## 6. Performance

Animate `transform` and `opacity` only — they run on the compositor without
layout or paint. `width`, `height`, `top`, `left`, and `margin` force reflow on
every frame.

Blur is expensive. `GradientBackdrop` is capped at two orbs for this reason.

Every scroll-triggered reveal uses `once: true`, so the observer disconnects
after firing rather than running for the page's lifetime.

## 7. Checklist for new motion

- [ ] `useReducedMotion()` checked, with a sensible static fallback
- [ ] `transform`/`opacity` only
- [ ] Duration within the table in §2
- [ ] `easeOut` for entrances
- [ ] Scroll reveals use `once: true`
- [ ] Stagger delays capped
- [ ] Decorative motion is `aria-hidden`
- [ ] Matching `focus-visible` state where there is a hover state
- [ ] No layout shift — space reserved before the animation runs
- [ ] Tested on a mid-range phone, not just a laptop
