# Audit & Consolidation Map: Inward Create & Edit SSOT

**Date:** 2026-10-06  
**Status:** APPROVED FOR IMPLEMENTATION  
**Target:** Elimination of duplicate `CorrectGrnModal` and alignment of partial-delivery guards with Single Source of Truth (SSOT).

---

## 1. Executive Summary & Problem Analysis

Currently, the cold-storage inward system maintains two divergent forms for inward receipts:
1. **Inward Creation Form**: `CreateGrnModal.tsx`, `useCreateGrnForm.ts`, `createGrnForm.helper.ts`
2. **Inward Correction Form**: `CorrectGrnModal.tsx`, `CorrectGrnIdentityFields.tsx`, `CorrectGrnRentLogisticsFields.tsx`, `useCorrectGrnForm.ts`

This duplication created structural anti-patterns:
- **Redundant UI & Layout**: 4 separate component files duplicating input fields for customer, date, chamber, commodity, bag composition, rental terms, and logistics.
- **Overzealous Guard Blocking**: `assertCorrectionAllowed` in `grn-edit-guards.ts` and `CorrectGrnModal.tsx` checked `opts.activeChallans > 0` and completely blocked editing with `GRN_ACTIVE_DELIVERY: Cannot correct GRN... stock has already been delivered. Use the delivery reversal workflow instead.` even when only partial bags were delivered and remaining stock was actively stored in the chamber.
- **Conflation of States**: Conflated a `CLOSED` GRN (100% delivered, 0 remaining stock) with a partially delivered GRN (active remaining stock available).

---

## 2. Responsibility Matrix: Current vs. Unified SSOT

| Responsibility | Current Create (`CreateGrnModal`) | Current Correct (`CorrectGrnModal`) | Unified SSOT (`CreateGrnModal` Mode) |
|---|---|---|---|
| **Entry Point** | Header "+ Inward of Goods" | Table row "Edit GRN" | Same modal with `mode: 'create' \| 'edit'` |
| **API Endpoint** | `POST /api/facilities/:facilityId/grns` | `PATCH /api/facilities/:facilityId/grns/:grnId` | `mode === 'create'` → POST, `mode === 'edit'` → PATCH |
| **RBAC Permission** | `grn:create` | `grn:correct` | Respective permission per action |
| **Initial Values** | Defaults / Today / Next GRN # | Pre-filled from `Grn` prop | Dynamic via `initialGrn` |
| **Customer Selection** | Search combobox + Add Customer | Dropdown (or read-only) | Search combobox in create; locked in edit if movement exists |
| **Identity Fields** | Required & Editable | Conditionally editable | Editable on create; locked in edit once stock has moved |
| **Chamber Location** | Required & Editable | Editable | Editable in both create & edit (unless CLOSED) |
| **Logistics & Marks** | GP#, Vehicle, Storage/Party Mark | GP#, Vehicle, Storage/Party Mark | Unified fields in both modes |
| **Bag Editing** | Free entry | Partial split handling | Bound by `netDeliveredBags`: cannot reduce below delivered quantity |
| **Closed GRN Guard** | N/A | Hard locked with banner | Hard locked (read-only view) |
| **Partial Delivery** | N/A | **BUG: Hard blocked modal** | **FIXED: Field-level disabled states; remaining stock & descriptive fields editable** |

---

## 3. Consolidation & Deletion Inventory

### Components to Supersede and Remove (Phase 4):
1. `packages/frontend/src/app/grns/components/CorrectGrnModal.tsx`
2. `packages/frontend/src/app/grns/components/CorrectGrnIdentityFields.tsx`
3. `packages/frontend/src/app/grns/components/CorrectGrnRentLogisticsFields.tsx`
4. `packages/frontend/src/app/grns/hooks/useCorrectGrnForm.ts`

### Unified Form SSOT (Phases 2 & 3):
1. `packages/frontend/src/app/grns/components/CreateGrnModal.tsx`:
   - Accepts `mode?: 'create' | 'edit'` (default `'create'`)
   - Accepts `initialGrn?: Grn`
   - Accepts `movementGuard?: { hasMovement: boolean; hasActiveIssued: boolean; netDeliveredBags?: number }`
2. `packages/frontend/src/app/grns/hooks/useCreateGrnForm.ts`:
   - Manages unified state for create and edit modes
   - Enforces field-level disabled states based on movement & delivery history
   - Submits to `POST /grns` (create) or `PATCH /grns/:id` (edit)
3. `packages/backend/src/modules/grn/handlers/grn-edit-guards.ts`:
   - Relaxes over-broad `opts.activeChallans > 0` hard-throw
   - Enforces:
     - `CLOSED` GRN → completely locked
     - `Partial Delivery` → core identity locked; descriptive fields editable; bags $\ge \text{netDeliveredBags}$
     - `No Movement` → standard edit rules

---

## 4. Anti-Fragmentation Checklist

- Duplicate Form: **0** (single `CreateGrnModal`)
- Duplicate Component: **0** (eliminated separate field sets)
- Duplicate Hook: **0** (single `useCreateGrnForm`)
- Duplicate API: **0** (uses existing POST and PATCH routes)
- Duplicate Schema: **0** (uses existing contracts)
- Zero Alien / Zombie / Dead code
