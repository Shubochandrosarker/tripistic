# Tripistic v2.0.0 UI System

## Principles

Tripistic v2 uses a dense, operational SaaS interface. The product should feel calm, fast, and premium without turning dashboard pages into marketing layouts.

## Theme Engine

Modes:

- Light
- Dark
- System

Implementation:

- `components/theme/theme-script.tsx` sets the first-paint theme.
- `components/theme/theme-provider.tsx` owns state and persistence.
- `components/theme/theme-toggle.tsx` renders the topbar mode control.
- `app/globals.css` maps semantic CSS variables to Tailwind tokens.

Persistence:

- `localStorage.tripistic-theme`
- `tripistic-theme` cookie

## Tokens

Semantic color tokens:

- `background`
- `foreground`
- `card`
- `muted`
- `muted-foreground`
- `border`
- `accent`
- `accent-foreground`
- `primary`
- `primary-foreground`

## Shell

The app shell includes:

- Desktop sidebar.
- Mobile drawer.
- Sticky topbar.
- Workspace switcher.
- Command/search trigger.
- Theme segmented control.
- User menu.

## Command Palette

Shortcut:

- Ctrl K on Windows/Linux.
- Command K on macOS.

Capabilities:

- Navigate to all dashboard/admin modules.
- Open AI itinerary and AI growth workflows.
- Search workspace bookings, customers, tours, and itineraries.

## Component Rules

- Use icons for compact actions.
- Use segmented controls for mode selection.
- Use status badges for state.
- Use tables for scan-heavy admin data.
- Use cards only for repeated items, metrics, modals, and framed tools.
- Keep dashboard pages compact and scannable.

## Required v2 Test Additions

- Theme persistence unit test.
- Command palette keyboard E2E test.
- Search endpoint RBAC integration test.
- Dark/light visual smoke tests.
- Mobile sidebar and topbar responsive tests.
- Axe accessibility checks for dashboard/admin shells.
