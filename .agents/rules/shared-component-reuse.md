# Permanent Strict Rule: Shared Component Reuse — No New Implementations

**Scope**: All packages (`packages/contracts`, `packages/backend`, `packages/frontend`)  
**Status**: ACTIVE, PERMANENT & MANDATORY — NO EXCEPTIONS WITHOUT EXPLICIT APPROVAL

---

## Core Mandate

All existing functionality, calculation logic, breakdowns, forms, and UI elements must be integrated through the established shared components.

**Do not create new components, duplicate implementations, independent calculation logic, or alternative breakdowns when an existing shared component already serves the requirement.**

Always reuse and extend the existing shared component when necessary, maintaining `packages/contracts` as the Single Source of Truth (SSOT).

---

## Specific Invariants

1. **Calculation & Breakdown SSOT**:
   - Outward rent calculations must exclusively use `calculateOutwardSeasonalBreakdown` and `resolveOutwardRates` / `resolveDiscriminatedOutwardRates` from `packages/contracts`.
   - Outward rent breakdown presentation must strictly reuse `OutwardRentBreakdown.tsx` and `formatSeasonalBreakdownRows` from `packages/frontend/src/app/deliveries/components/outwardRentBreakdown.helper.ts`.
   - Never write parallel/ad-hoc table loops or independent math for storage rent or extensions.

2. **UI Component & Form Reuse**:
   - Rent collection workflows must reuse `CollectPaymentModal.tsx` and `useCollectPaymentForm.ts`.
   - Never create separate payment modals for Gate Pass vs GRN collection; pass the specific entity (`delivery`) to the existing shared component.
   - All modal, form, button, and table primitives must come from `packages/frontend/src/components/ui/`.

3. **Domain Contracts SSOT (`packages/contracts`)**:
   - When extending capabilities (e.g. adding `deliveryId` or `gpNumber` to payment flows), update the shared contracts in `packages/contracts/src/` first.
   - Frontend and backend must consume the same shared types and Zod schemas directly. Local interface re-declarations or parallel types are strictly forbidden.

4. **Extension Pairing Rule**:
   - Post-season extensions (January and February) must always be formatted/displayed paired as `Jan - Feb (2 months)` in all bills, cash memos, and breakdowns.

