# GRN Storage Occupancy, Delivery, & Rent Settlement Audit Baseline

## 1. Executive Summary

This document establishes the audit baseline for Phase 0 of the dedicated feature branch `feat/grn-storage-occupancy-rent-settlement`.
All verification gates passed before modifying any code:
- **Contracts Test Suite**: 10 passed / 10 test files (93 tests)
- **Backend Test Suite**: 52 passed / 52 test files (388 tests, 0 failures)
- **Frontend Test Suite**: Passed (passWithNoTests)
- **Type Checking**: Clean (`tsc` across all workspaces)
- **Linting**: Clean (`eslint` across all workspaces)
- **Production Builds**: Clean Next.js + Express backend + Zod contracts builds

---

## 2. Invariant Trace & Current State Analysis

### Lifecycle Trace
`GRN → Inward → Storage → Partial Outward → Remaining Balance → Additional Outward → Final Outward → Closing → Rent → Payment`

### Detailed Component Inspection

| Domain Area | Files Inspected | Baseline Finding / Status |
| :--- | :--- | :--- |
| **Contracts** | `packages/contracts/src/delivery.ts`<br>`packages/contracts/src/grn.ts`<br>`packages/contracts/src/pricing.ts`<br>`packages/contracts/src/rent.ts` | `DeliveryChallan` schema lacks snapshot fields: `openingBags`, `closingBags`, `marks`, `gpNumber`. `pricing.ts` has `calculateMonthlyCharge()` but it is never invoked. |
| **Mongoose Models** | `packages/backend/src/database/models/delivery-challan.model.ts`<br>`inventory-transaction.model.ts`<br>`grn.model.ts`<br>`rent-payment.model.ts` | `DeliveryChallanDoc` lacks `openingBags`, `closingBags`, `marks`, `gpNumber`. `RentPaymentModel` correctly maintains append-only immutability. |
| **Delivery Handlers** | `packages/backend/src/modules/delivery/handlers/create-delivery.handler.ts`<br>`reverse-delivery.handler.ts` | Handlers correctly compute `remainingDeliveryBalance` in-transaction, but do not persist the movement snapshot (`openingBags`, `closingBags`, `marks`, `gpNumber`) to `DeliveryChallanModel`. GRN closes strictly when remaining balance reaches 0. |
| **Inventory Transactions** | `packages/backend/src/database/models/inventory-transaction.model.ts`<br>`packages/backend/src/modules/delivery/handlers/create-delivery.handler.ts` | Records `OUTWARD_DELIVERY` and `DELIVERY_REVERSAL` in an append-only ledger. Sufficient to reconstruct movement history, but no query currently exists to present it canonical form. |
| **Rent Service & Calculation** | `packages/backend/src/modules/rent/rent.service.ts`<br>`packages/contracts/src/pricing.ts`<br>`packages/backend/src/modules/common/rent-balance.ts` | `computeRentBalance()` is the canonical balance formula. However, `grn.rentAmount` is fixed at inward time based on original `input.bags`. Dynamic occupancy-based calculation does not exist yet. |
| **Rent Gate** | `packages/backend/src/modules/rent/rent-gate.service.ts` | Partial deliveries correctly do not require full settlement. Delivery is only blocked if zero payment has been recorded when `rentAmount > 0`. |
| **Payment Handlers** | `packages/backend/src/modules/rent/handlers/record-rent-payment.handler.ts` | Validates payment idempotency and prevents overpayment against balance. |
| **Frontend UI & Hooks** | `packages/frontend/src/app/grns/components/GrnTable.tsx`<br>`packages/frontend/src/app/deliveries/components/CreateDeliveryModal.tsx`<br>`packages/frontend/src/app/rent/hooks/useRentData.ts` | `GrnTable.tsx` contains a client-side fallback recalculation of `closingBags`. `useRentData.ts` fetches all GRNs without filtering by status. |

---

## 3. Discovered Gaps & Remediation Plan

1. **Phase 1: Delivery Movement Balance Snapshots**
   - Add `openingBags`, `closingBags`, `marks`, `gpNumber` to `DeliveryChallan` contract and Mongoose model.
   - Persist these snapshots in `create-delivery.handler.ts` from transaction-validated balances.
   - Remove client-side fallback recomputations in `GrnTable.tsx`.
   - Add regression tests covering partial, multi-partial, and final outward movements.

2. **Phase 2: Canonical Movement History Query**
   - Implement `getGrnMovementHistory()` in `packages/backend/src/modules/grn/queries/grn-movement-history.queries.ts`.
   - Reconstruct movement ledger ordered chronologically (`INWARD`, `PARTIAL_OUTWARD`, `FINAL_OUTWARD`, `DELIVERY_REVERSAL`).
   - Add deterministic unit/integration tests.

3. **Phase 3: Occupancy-Based Monthly Rent Calculation**
   - Implement `calculateOccupancyRentByPeriod()` in `pricing.ts`.
   - Implement backend occupancy rent calculation service consuming canonical movement history.
   - Explicitly document design boundary on mid-month delivery (full month billing vs proration).

4. **Phase 4: Seasonal Rent Calculation**
   - Reuse canonical movement history and occupancy calculation for seasonal storage terms.

5. **Phase 5: Payment & Settlement Integrity**
   - Verify partial delivery without forced settlement.
   - Verify final delivery closure and settlement calculations.

6. **Phase 6: Storage Occupancy Audit Reporting**
   - Add read-only audit endpoint for monthly/seasonal views derived from canonical records.

7. **Phase 7: UI / UX Cleanliness**
   - Clean delivery challan and rent interfaces using existing design-system primitives.

8. **Phase 8 & 9: Dead Code, SSOT & Final Quality Assurance**
   - Remove dead calculations, unused imports/exports, verify database indexes and query efficiency.

---

## 4. Baseline Gate Verification
- Commit: `chore(grn): establish storage occupancy audit baseline`

---

## 5. Phase 9 SSOT & Full Code Quality Verification Sign-Off

### Architecture Verification: 6 Canonical SSOT Pillars
1. **Canonical GRN Balance**: `validateStockAndBalances()` in `delivery-validation.helper.ts` derives remaining stock directly from the ledger.
2. **Canonical Movement History**: `getGrnMovementHistory()` in `modules/common/grn-movement-history.ts` reconstructs all chronological inward/outward events.
3. **Canonical Monthly Occupancy**: `calculateMonthlyOccupancy()` in contracts `pricing.ts` + `calculateGrnMonthlyOccupancyRent()` in backend `occupancy-rent.ts`.
4. **Canonical Seasonal Occupancy**: `calculateSeasonalOccupancy()` in contracts `rent.ts` + `calculateGrnSeasonalOccupancyRent()` in backend `occupancy-rent.ts`.
5. **Canonical Payment Balance**: `computeRentBalance()` in `modules/common/rent-balance.ts` governs all rent readers and mutators.
6. **Canonical Storage Audit Report**: `generateStorageOccupancyReport()` in `modules/common/storage-audit-report.ts` derives read-only reporting purely from existing records with zero duplicate writes.

### Security, Performance & Hygiene
- **Facility Isolation & Scoping**: Verified across all routes and services via `requireFacilityScope` and `facilityId` query constraints.
- **Strict Over-Delivery Prevention**: Verified via in-transaction write locks and `validateStockAndBalances`.
- **Payment Integrity & Idempotency**: Verified via transaction write-lock on GRN and append-only `RentPaymentModel`.
- **Index Coverage**: Verified all queried fields (`facilityId`, `grnId`, `date`, `receiptNumber`, `challanNumber`) have compound indexes.
- **Line Budget**: All 29 files strictly comply with the <= 250 lines ratchet.
