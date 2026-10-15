# Subsystems Integrity Remediation Plan
**Branch:** `fix/hamali-bag-types-rent-integrity`  
**Date:** 2026-10-15  
**Scope:** Hamali Rate Configuration, Small/Big/Hybrid Bag Types, Seasonal/Monthly Rent, Internal Movement, GRN Merging, Repacking/Rebagging, Full/Partial Ownership Transfer.

---

## 1. Baseline Verification
- **Base Branch:** `fix/rent-inventory-hamali-ssot` (verified clean working tree, `81f67f7`).
- **Feature Branch:** `fix/hamali-bag-types-rent-integrity`.
- **Pre-execution Verification:**
  - `npm run type-check`: Passed (Contracts, Backend, Frontend).
  - `npm run build`: Passed (Production builds successful across all workspaces).
  - Contracts Vitest Suite: 23 test files, 249 tests passing.
  - Backend Vitest Integration Suites: Database service running; `hamali-first-season`, `hamali-merge-accounting`, `merge-repack-hamali`, `merge-bag-category`, `transfer-ownership-hamali`, `transfer-ownership-rent`, `storage-audit-report` passing.

---

## 2. Phased Implementation Roadmap

### Phase 1 — SSOT and Business Rule Audit
- Establish formal baseline, verify canonical math formulas, bag composition invariants, rent obligations, and movement rules.

### Phase 2 — Hamali Integrity
- **Stale Snapshot on GRN Edit:** In `packages/backend/src/modules/grn/handlers/update-grn.handler.ts`, update `hamaliRate` and recompute `hamaliAmount = calculateHamaliAmount(finalBags, hamaliRate)` when bags or commodity change.
- **Storage Audit Report Inclusion:** In `packages/backend/src/modules/common/storage-audit-report.ts`, resolve and pass `hamaliShare` to `rentExtensionRepository.resolveTotalDue` using `computeFirstSeasonHamali`.
- **Zero-Rent Intake Hamali Settlement:** In `packages/contracts/src/rent-obligation.ts`, allow Hamali share to join total due when `outwardRentCharges === 0 && rentAmount === 0`.

### Phase 3 — Bag Type Integrity
- **Inward Selection:** In `packages/frontend/src/app/grns/hooks/useCreateGrnForm.ts` and `CreateGrnModal.tsx`, provide explicit Bag Type selector (`'S/B' | 'S' | 'B'`) and expose setter `setCreateBagType`.
- **Composition Sync:** Ensure `smallBags` and `bigBags` automatically sync to total bags when `'S'` or `'B'` is selected.
- **Form Validation & Submission:** Ensure `createGrnForm.helper.ts` validates and submits the selected bag type.

### Phase 4 — Rent Calculation Integrity (Verified)
- **Seasonal Lump-Sum Invariant:** Verified `months = 1` in `pricing.ts` (never multiplied by season duration).
- **Monthly Elapsed Cycles:** Verified `Math.ceil` cycle counting with 1-day minimum.
- **Obligation Base Verification:** Verified `Math.max(rentAmount, outwardRentCharges)` for Monthly/Seasonal_3M and seasonal lock for Seasonal.
- **Test Evidence:** Verified across `pricing.contracts.test.ts`, `rent-extension.contracts.test.ts`, `seasonal-3m-and-hamali.contracts.test.ts`, `occupancy-rent.test.ts`, `delivery-outward-rent.test.ts`, and `rent-billing-lifecycle.test.ts`. All 250 contract tests and 17 backend rent tests passing.

### Phase 5 — Internal Movement and GRN Merging
- **Rent Type Guard:** Verify strict rent type equality (`source.rentType === target.rentType`).
- **Repacking Hamali Labor:** Verify `merge-repack-hamali.helper.ts` labor calculation ($B_{\text{moved}} \times \text{hamaliRate}$) added to `targetGrn.rentAmount`.
- **Bag Type Rollup:** Verify `resolveMergedBagType` transitions.

### Phase 6 — Ownership Transfer
- **Full Transfer:** Verify prospective delivery-style rent evaluation at transfer date (`computeExpectedDeliveryRent`) and settlement gate (`SETTLE_NOW` vs `AGREED_PENDING`).
- **Partial Transfer:** Verify split-GRN initialization (`rentAmount: 0`, `hamaliRate: 0`, `hamaliAmount: 0`, preserved inward date, inherited rent rates) and source liability retention.

### Phase 7 — UI/UX and Code Quality
- **Merge Tab Transparency:** Add live repacking labor charge preview card in `InternalMovementMergeTab.tsx`.
- **Schema Cleanup:** Tag dead delivery challan hamali fields and dormant commodity rate hamali fields as `@deprecated`.

### Phase 8 — Verification and PR Readiness
- Run full regression suites across all packages.
- Execute `npm run type-check` and `npm run build`.
- Prepare comprehensive PR summary and evidence.
