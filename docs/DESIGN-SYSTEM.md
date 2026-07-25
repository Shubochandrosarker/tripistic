# Design System

The visual language of the public website. It is intentionally the *same*
system as the application — a marketing site that looks nothing like the product
sets up a disappointment at signup.

## 1. Tokens

Defined in `app/globals.css` as CSS custom properties, exposed to Tailwind v4
through `@theme`. Never hardcode a hex value in a component.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#fafafa` | `#0b0b0c` | Page background |
| `--foreground` | `#18181b` | `#f4f4f5` | Primary text |
| `--card` | `#ffffff` | `#131316` | Surfaces, cards, panels |
| `--muted` | `#f4f4f5` | `#1c1c20` | Secondary surfaces, chips |
| `--muted-foreground` | `#71717a` | `#9f9fa8` | Secondary text |
| `--border-subtle` | `#e4e4e7` | `#26262b` | All borders |
| `--accent` | `#059669` | `#10b981` | Brand, links, emphasis, focus |
| `--accent-foreground` | `#ffffff` | `#04150e` | Text on accent |
| `--primary` | `#18181b` | `#fafafa` | Primary buttons |
| `--primary-foreground` | `#fafafa` | `#18181b` | Text on primary |

Tailwind class names: `bg-background`, `text-foreground`, `bg-card`,
`text-muted-foreground`, `border-border`, `text-accent`, `bg-accent`.

### Why accent shifts between themes

`#059669` on white gives 4.53:1 — passing AA for body text. On the dark
background it would sit at roughly 3.1:1, so dark mode uses the lighter
`#10b981` at 6.4:1. **Any new colour must be checked in both themes**, not just
the one you happen to be viewing.

## 2. Theming

Three-state theme: `light`, `dark`, `system`. `ThemeScript` runs before paint to
set `data-theme` on `<html>`, so there is no flash of the wrong theme.
`ThemeToggle` sits in the marketing header on every public page.

Dark mode resolves through two paths — an explicit `data-theme="dark"`, and
`prefers-color-scheme: dark` for `html:not([data-theme])`. Both are defined, so
a visitor who has never touched the toggle still gets their system preference.

## 3. Typography

| Role | Token | Notes |
| --- | --- | --- |
| Sans | `--font-sans` → Geist Sans | All interface and body text |
| Mono | `--font-mono` → Geist Mono | Code, IDs, tabular figures |

Loaded through `next/font`, so there is no external request and no layout shift.

| Element | Classes |
| --- | --- |
| Page title | `text-3xl font-semibold tracking-tight sm:text-5xl` |
| Hero title | `text-5xl font-semibold tracking-tight sm:text-7xl` |
| Section heading | `text-2xl font-semibold tracking-tight` |
| Card heading | `text-lg font-semibold` |
| Body | `text-sm leading-6` (`text-base leading-7` for intros) |
| Eyebrow | `text-sm font-semibold uppercase tracking-wide text-accent` |
| Meta | `text-xs text-muted-foreground` |

Long-form content uses `.prose-content`, capped at `72ch` — comfortable reading
measure, not full container width.

## 4. Spacing and layout

An 8px base scale. In practice: `gap-2` (8px) inside components, `gap-4` (16px)
between cards, `gap-10` (40px) between columns, `py-16` (64px) between sections.

| Container | Class |
| --- | --- |
| Standard page | `mx-auto max-w-7xl px-4 sm:px-6` |
| Reading column | `mx-auto max-w-4xl` |
| Content + sidebar | `grid gap-10 lg:grid-cols-[1fr_280px]` |
| Hero split | `grid gap-10 lg:grid-cols-[.9fr_1.1fr]` |

Generous spacing is a deliberate part of the premium feel. When in doubt, add
space rather than remove it.

## 5. Surfaces

The core card:

```
rounded-lg border border-border bg-card p-5 shadow-sm
```

Interactive cards add:

```
transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md
```

**Radius:** `rounded-md` (6px) for small controls, `rounded-lg` (8px) for cards
and buttons, `rounded-full` for chips and pills. Nothing larger — oversized
radii read as consumer, not enterprise.

**Elevation:** `shadow-sm` at rest, `shadow-md` on hover. There is no third
level. Depth comes from borders and background separation, not heavy shadows.

**Glass:** reserved for the sticky header (`bg-background/82 backdrop-blur`) and
the consent banner. Used more widely it costs legibility and paint performance.

**Gradients:** ambient only — `GradientBackdrop` blurred accent orbs, and
`linear-gradient(135deg, var(--muted), var(--card))` for preview panels. Never
gradient text, never a gradient behind body copy.

## 6. Buttons

`components/ui/button.tsx` — `Button` and `ButtonLink` share one class base.

| Variant | Use |
| --- | --- |
| `primary` | The single most important action on a view |
| `accent` | Brand-forward emphasis |
| `secondary` | Bordered alternative next to a primary |
| `ghost` | Low-emphasis, in dense navigation |
| `danger` | Destructive only |

Sizes: `sm` (h-8), `md` (h-9, default), `lg` (h-11, hero and section CTAs).

One primary action per view. Two primaries next to each other is not emphasis,
it is indecision.

## 7. Focus and interaction states

Every interactive element carries:

```
focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
```

This is not optional. A component without a visible focus ring fails WCAG 2.4.7
and is unusable for keyboard navigation.

Hover states use `transition-colors` or `transition` at the default 150ms.
Anything slower feels sluggish; anything faster is not perceived as a
transition.

## 8. Status colour

Status is never conveyed by colour alone — every state pairs a colour with a
label or icon.

| Meaning | Treatment |
| --- | --- |
| Success / included | `text-accent` + `Check` icon |
| Neutral / excluded | `text-muted-foreground/50` + `Minus` icon |
| Warning | Amber + explicit label |
| Error | `text-red-600 dark:text-red-400` + `role="alert"` |
| Emphasis chip | `bg-accent/10 text-accent rounded-full px-2.5 py-1 text-xs` |

## 9. Responsive

Mobile-first. Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

- Primary navigation collapses to `MobileNav` below `lg`.
- Card grids run 1 → 2 → 3 columns across `sm` → `md` → `lg`.
- Sidebars stack under content below `lg`.
- Wide tables scroll inside `overflow-x-auto`; **the page body never scrolls
  horizontally**.
- Everything remains usable at a 320px viewport and at 200% zoom.

## 10. Adding to the system

Before adding a component, check `COMPONENT-LIBRARY.md` — most needs are already
covered. If you do add one:

1. Use tokens, never literal colours.
2. Verify contrast in **both** themes.
3. Add a visible focus state.
4. Confirm it works at 320px and at 200% zoom.
5. If it animates, check `useReducedMotion()` — see `ANIMATION-GUIDE.md`.
6. If it conveys status, pair colour with text or an icon.
