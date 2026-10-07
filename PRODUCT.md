# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Cold storage facility operators, warehouse managers, dock clerks, inventory controllers, and accounts personnel managing agricultural/commercial commodity storage, customer ledgers, goods receipt, delivery withdrawals, and rent billing.

## Product Purpose

Operational management and compliance platform for commercial cold storage facilities. Governs the entire operational and financial lifecycle: Inward goods receipt → Goods Receipt Note (GRN) issuance → Storage chamber management → Delivery withdrawal orders → GRN closing → Rent billing, cash memo generation, and gate pass clearance.

## Positioning

An authoritative, single-source-of-truth management platform built specifically for high-throughput cold storage operations, combining physical stock reconciliation (Bags, S+B bag composition, lots) with strict regulatory compliance, auditable financial ledgers, and zero-loss inventory tracking.

## Operating Context

- Used in active warehouse and facility back-office environments on desktop and mobile/tablet devices.
- High-volume data entry during peak seasonal inward harvesting periods, demanding dense tabular scanning, quick keyboard navigation, and immediate validation.
- Authoritative operational lifecycle: `Inward → ACK → GRN → Delivery-Out → Closing → Cash Memo / Rent Settlement`.

## Capabilities and Constraints

- Monorepo architecture (`@cold-storage/contracts`, `@cold-storage/backend`, `@cold-storage/frontend`).
- Canonical UI primitives SSOT located in `packages/frontend/src/components/ui/`.
- Design tokens SSOT defined in `packages/frontend/src/styles/tokens.css`.
- Single bordered surface rule: `Card` is the sole bordered surface; `DataTable` owns its own border; no nesting of bordered containers.
- Strict architecture boundary rules enforced by `scripts/hygiene-audit.sh` and 250-line per-file source budget.
- Multi-facility context switching with role-based access control.

## Brand Commitments

- Product Name: Cold Storage Management System (ColdStorage).
- Compact, information-dense, enterprise utility aesthetic.
- Subtle neutral palette with high-contrast semantic indicators (Primary Blue, Success Green, Warning Amber, Danger Red).

## Evidence on Hand

- Production-ready monorepo with 16 frontend app routes.
- Fully typed shared contracts package with 105 automated contract tests.
- Frontend test suite with 49 component and hook unit tests.
- Deterministic hygiene audit script enforcing architectural and accessibility gates.

## Product Principles

1. **Authoritative Lineage**: Every operational field and inventory movement belongs to a single canonical source of truth.
2. **Dense Utility Over Decoration**: Compact, readable layouts that maximize visible data and minimize scrolling, avoiding gratuitous animations or decorative clutter.
3. **Deterministic Governance**: Automated quality and hygiene gates prevent duplicate primitives, legacy artifacts, and regression of line budgets.
4. **Accessible by Default**: Complete keyboard navigation, visible focus rings, semantic dialogs, and WCAG AA contrast compliance across all screens.

## Accessibility & Inclusion

- Compliance level: WCAG 2.1 AA across desktop and mobile viewports.
- Minimum 4.5:1 contrast for all normal text and 3:1 for interactive controls and badges.
- Accessible name bindings on all interactive inputs and form controls.
- Modal dialogs with programmatic focus trapping and Escape key dismissal.
