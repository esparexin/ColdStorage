---
name: Cold Storage Design System
description: Compact, information-dense operational design system for cold storage facility management
colors:
  primary: "hsl(220, 90%, 56%)"
  primary-hover: "hsl(220, 90%, 48%)"
  primary-subtle: "hsl(220, 90%, 96%)"
  primary-text: "hsl(220, 90%, 52%)"
  success: "hsl(145, 65%, 42%)"
  success-subtle: "hsl(145, 65%, 95%)"
  success-text: "hsl(145, 65%, 29.5%)"
  warning: "hsl(38, 92%, 50%)"
  warning-subtle: "hsl(38, 92%, 96%)"
  warning-text: "hsl(38, 92%, 31%)"
  danger: "hsl(0, 72%, 51%)"
  danger-hover: "hsl(0, 72%, 44%)"
  danger-subtle: "hsl(0, 72%, 96%)"
  danger-text: "hsl(0, 72%, 48%)"
  surface-0: "hsl(220, 20%, 98%)"
  surface-1: "hsl(220, 20%, 100%)"
  surface-2: "hsl(220, 14%, 95%)"
  border: "hsl(220, 14%, 90%)"
  border-strong: "hsl(220, 14%, 80%)"
  text-primary: "hsl(220, 20%, 12%)"
  text-secondary: "hsl(220, 14%, 40%)"
  text-muted: "hsl(220, 14%, 45%)"
  text-on-accent: "hsl(0, 0%, 100%)"
typography:
  display:
    fontFamily: "var(--font-sans)"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
  h1:
    fontFamily: "var(--font-sans)"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  h2:
    fontFamily: "var(--font-sans)"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "var(--font-sans)"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  micro:
    fontFamily: "var(--font-sans)"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  xxl: "2rem"
---

# Design System

## Overview

ColdStorage utilizes a purposeful, compact, information-dense operational design system. Every visual decision prioritizes rapid data scanning, clear inventory legibility, low cognitive friction during high-volume entries, and strict compliance with WCAG AA accessibility standards.

## Colors

All colors are strictly tokenized in `packages/frontend/src/styles/tokens.css`.
- **Primary**: Brand blue used for active selections, interactive links, primary actions, and focus rings.
- **Semantic Accents**:
  - `Success`: Verified goods, active GRNs, completed payments, positive stock deltas.
  - `Warning`: Partial releases, pending closures, expiring lots, cautionary balances.
  - `Danger`: Overdue accounts, closed/voided vouchers, critical inventory alerts.
- **Surface Scale**: Three-tier neutral elevation (`surface-0` page canvas, `surface-1` card/table containers, `surface-2` subtle input/hover backgrounds).

## Typography

Typography is governed by `--font-sans` with compact admin scale:
- `12px (--text-xs)`: Micro-labels, table column headers, status badges, timestamp subtitles.
- `14px (--text-sm)`: Default body text, data table cells, form labels, control labels.
- `16px (--text-base)`: Section headers (H2), modal titles, prominent input values.
- `18px (--text-lg)`: Page headers (H1), primary sheet titles.
- `20px (--text-xl)`: KPI focal metrics and summary counters.

## Layout

- **Shell**: Responsive layout with collapsible desktop sidebar (`--sidebar-width: 216px`), standard top navigation bar (`--header-height: 56px`), and fluid content viewport.
- **Responsive Breakpoints**:
  - Desktop (>1024px): Full multi-column grids, comprehensive data tables, side-by-side forms.
  - Tablet (768px-1024px): Responsive collapsed sidebar, adaptive table columns.
  - Mobile (<768px): Bottom drawer / hamburger navigation, stacked form inputs, card-mode table adaptations.

## Elevation & Depth

- Elevation is communicated primarily through subtle borders (`--color-border`) rather than heavy drop shadows.
- Modals utilize a centered scrim (`--color-scrim`: `hsla(220, 20%, 12%, 0.55)`).
- Drop shadows are minimal and functional:
  - `--shadow-sm`: Subtle card elevation.
  - `--shadow-md`: Dropdown menus, popovers.
  - `--shadow-lg`: Floating dialogs and modals.

## Shapes

- Small radius (`--radius-sm: 4px`) for compact buttons, input controls, and status badges.
- Medium radius (`--radius-md: 8px`) for cards, modal dialogs, and tabular containers.
- Pill radius (`--radius-full: 9999px`) reserved for numerical counters and status chips.

## Components

All user interface elements must exclusively consume canonical primitives from `packages/frontend/src/components/ui/`:
1. `Button`: Primary, secondary, outline, danger variants with keyboard focus ring.
2. `Input`: Text, numeric, phone, email, date input fields with accessible label associations.
3. `Modal` / `ConfirmDialog`: Semantic HTML dialogs with focus trap and Escape key dismissal.
4. `Select`: Accessible dropdown selection component.
5. `Badge`: Status, indicator, and counter chips.
6. `Card`: The single bordered surface for feature grouping.
7. `StatCard` / `StatGrid`: Key metric KPI displays.
8. `SearchBar`: Standardized search input with debounced querying.
9. `FilterToolbar`: Unified search + filter-select + reset toolbar used across all list views.
10. `Pagination`: Accessible page navigation rendered by `DataTable`.
11. `DataTable`: Enterprise tabular view with sorting, loading skeletons, and empty states.
12. `FeedbackStates`: Standardized Loading, Empty, and Error state banners.

## Do's and Don'ts

### Do
- Always use CSS variables from `tokens.css`.
- Always wrap table views directly without redundant outer `Card` nesting (Single Bordered Surface Rule).
- Always ensure form inputs have visible, associated `<label>` elements or `aria-label`.
- Always keep font sizes within the compact admin scale (12px-20px).
- Always use `FeedbackStates` for empty, loading, or error states.

### Don't
- Never hardcode raw hex, rgb, or hsl values in component stylesheets.
- Never wrap a `DataTable` in a `Card` (creates competing double borders).
- Never define duplicate modal backdrops or pagination button classes in feature CSS modules.
- Never add decorative animations or motion that do not convey operational state or feedback.
- Never override ColdStorage business rules, calculations, or contracts for visual convenience.
