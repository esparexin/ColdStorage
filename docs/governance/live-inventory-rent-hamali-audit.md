# ColdStorage — Live Repository Audit & Phased Implementation Plan

**Branch:** `fix/live-inventory-rent-hamali-integrity`  
**Base Commit:** `363082c` (on top of `main` @ `07b3ca7`)  
**Audit Date:** 2026-10-16  
**Environment:** Node >= 20, TypeScript 5.6.3, Express 4.21.1, Next.js 14.2.35, MongoDB 8.8.0  

---

## 1. Verified Repository Baseline

### A. Git State and Repository Roots
- **Repository Root:** `/Users/admin/Desktop/ColdStorage`
- **Active Production (`live`) Branch:** `origin/main` (`07b3ca7` — "Merge pull request #139 from esparexin/fix/grn-pricing-rent-validation")
- **Integration Base:** Commit `363082c` ("docs(remediation): finalize phase 8 verification and PR readiness report") on `fix/hamali-bag-types-rent-integrity`
- **Dedicated Feature Branch Created:** `fix/live-inventory-rent-hamali-integrity` (branched cleanly from `363082c`)
- **Working Tree:** 100% clean, no uncommitted changes, no untracked files
- **Remotes:** `origin` -> `https://github.com/esparexin/ColdStorage.git`

### B. Baseline Verification Gates
| Verification Check | Status | Evidence / Notes |
|---|---|---|
| `npm run build` | **PASS** | Exit 0. Clean compilation across `@cold-storage/contracts`, `@cold-storage/backend`, `@cold-storage/frontend`. All 18 Next.js pages statically generated. |
| `npm run type-check` | **PASS** | Exit 0. 0 TypeScript errors across all 3 workspaces. |
| `npm run hygiene` | **PASS** | Exit 0. All 15 audit dimensions passed: line-budget (250 lines), architecture boundary, a11y, SSOT, cycles, backup coverage, DB connection governance, money SSOT, permissions, numeric rounding, dead CSS. |
| `npm test` (`@cold-storage/contracts`) | **PASS** | 23 test files, 250 tests passing in 846ms (100% green). |
| `npm test` (`@cold-storage/frontend`) | **PASS** | 34 test files, 339 tests passing in 1.00s (100% green). |
| `npm run lint` | **2 WARNINGS / DEFECTS** | 2 unused imports in test files: `packages/backend/src/__tests__/e2e-multi-facility-lifecycle.test.ts:13:10` and `ledger-balance.test.ts:3:10` (`CommodityRateModel` imported but unused). |
| Backend Integration Tests (`vitest run --fileParallelism=false`) | **PARTIAL PASS** | 113 files passing; 16 legacy suites fail due to unseeded controller rates in historical mock payloads (e.g. `bond-loan-lifecycle.test.ts`, `grn-manual-number.test.ts`). |

---

## 2. End-to-End Workflow Audit Findings

### Workflow A: Inward GRN
- **Files:**
  - `packages/backend/src/modules/grn/handlers/create-grn.handler.ts` (lines 30–248)
  - `packages/backend/src/modules/grn/handlers/update-grn.handler.ts` (lines 29–215)
  - `packages/backend/src/modules/grn/handlers/grn-edit-bags.ts` (lines 1–110)
  - `packages/backend/src/modules/grn/handlers/grn-edit-rent.ts` (lines 1–120)
  - `packages/contracts/src/bags.ts` (lines 80–120)
  - `packages/contracts/src/pricing.ts` (lines 45–100)
- **Verified Business Rules & Behavior:**
  1. **GR Numbering:** Entered as exactly four digits (`grnNumberInputSchema`, `^\d{4}$`). Sole business key; unique per facility.
  2. **Inward Receipt Numbering:** Deterministically derived as `INW-YY-YY-NNNN` from FY + GR number (`buildInwardReceiptNumber`).
  3. **Controller Rate Validation:** `commodityRateService.validateSubmittedRates` enforces that submitted rates and lump sums match the active controller row (fail-closed).
  4. **Bag Composition:** `normalizeBagComposition` enforces single-type consistency (`S` -> `smallBags = bags, bigBags = 0`; `B` -> `smallBags = 0, bigBags = bags`). Mixed `S/B` or `S+B` permits split matching total or unsegregated total (`isCompositionVerified: false`).
  5. **Hamali Snapshot:** Snapshotted directly from Commodity Master: `hamaliRate = commodity.hamaliRate` (if applicable), `hamaliAmount = bags * hamaliRate`. Recomputed upon GRN edit in `update-grn.handler.ts:161-168` when commodity or bag count changes.
  6. **Inventory Persistence:** In the same atomic MongoDB transaction as the receipt, `InventoryTransactionModel.create` records `INWARD_PUTAWAY` with exact small/big breakdown (`create-grn.handler.ts:211-232`).

### Workflow B: Outward Delivery — Full and Partial
- **Files:**
  - `packages/backend/src/modules/delivery/handlers/create-delivery.handler.ts` (lines 30–250)
  - `packages/backend/src/modules/delivery/handlers/delivery-rent.helper.ts` (lines 1–120)
  - `packages/backend/src/modules/delivery/handlers/delivery-validation.helper.ts` (lines 1–90)
  - `packages/backend/src/modules/delivery/handlers/delivery-hamali.helper.ts` (lines 1–65)
  - `packages/contracts/src/delivery.ts` (lines 1–180)
  - `packages/contracts/src/pricing.ts` (lines 45–100)
- **Verified Business Rules & Behavior:**
  1. **Stock Validation:** `validateStockAndBalances` and `readLedgerBalance` check stock and prevent overdraft.
  2. **Partial Withdrawals:** Supports partial outward delivery; updates remaining balance; preserves OPEN status while bags or rent remain.
  3. **Rent Calculation:** Authoritative outward calculation from inward date to delivery date. For Seasonal, single whole-season lump sum (`months = 1`); for Monthly, fractional months ceiling (`calculateMonthlyElapsedCycles`).
  4. **Hamali Allocation:** Inward first-season Hamali is allocated pro-rata on partial outward withdrawals via `allocateHamaliShare`.
  5. **Closure Invariant:** Closed ONLY when both `remainingBags === 0` AND `remainingBalance === 0` (`create-delivery.handler.ts:227-231`).
  6. **Document Generation:** Produces `DeliveryChallan` with sequential `gpNumber` (`GP-0001`, `GP-0002`).

### Workflow C: Merge with Existing GRN
- **Files:**
  - `packages/backend/src/modules/internal-movement/handlers/merge-grn.handler.ts` (lines 17–215)
  - `packages/backend/src/modules/internal-movement/handlers/merge-source-move.helper.ts` (lines 1–130)
  - `packages/backend/src/modules/internal-movement/handlers/merge-repack-hamali.helper.ts` (lines 1–55)
  - `packages/contracts/src/internal-movement.ts` (lines 1–119)
- **Verified Business Rules & Behavior:**
  1. **Eligibility:** Target and source must match facility and `rentType`. Target cannot be CLOSED or under active loan hold.
  2. **Bag Reconciliation:** Target bag type transitions dynamically (`S` + `B` becomes `S+B`) via `resolveMergedBagType`.
  3. **Rent Liability Carry-Forward:** Cumulative source pending rent is carried forward and added to `targetGrn.rentAmount`.
  4. **Repacking Labor Hamali:** Calculated as $B_{\text{moved}} \times \text{hamaliRate}$ using the target commodity's master hamali rate (`resolveMergeRepackHamali`) and added to `targetGrn.rentAmount`.
  5. **Stock Ledger:** Records `OUTWARD_DELIVERY` (reference `INTERNAL_MOVE`) on source and `INWARD_PUTAWAY` on target.

### Workflow D: Ownership Transfer — Full Transfer Only (CRITICAL DEFECT IDENTIFIED)
- **Files:**
  - `packages/backend/src/modules/internal-movement/handlers/transfer-ownership.handler.ts` (lines 20–247)
  - `packages/backend/src/modules/internal-movement/handlers/transfer-split.helper.ts` (lines 1–138)
  - `packages/contracts/src/internal-movement.ts` (lines 50–69)
  - `packages/frontend/src/app/grns/components/InternalMovementTransferTab.tsx` (lines 1–251)
- **Finding:**
  - **Business Rule Requirement:** Ownership transfer must be **Full Transfer Only**. Partial ownership transfers or split-GRN ownership transfers MUST NOT be implemented.
  - **Live Code Status:**
    - The Frontend UI (`InternalMovementTransferTab.tsx`) already strictly implements Full Transfer Only: it submits the entire remaining stock of the GRN without exposing any partial split fields.
    - However, backend `transfer-ownership.handler.ts:25-28` contains an unapproved branch:
      ```ts
      if (input.transferSmallBags != null || input.transferBigBags != null) {
        const partial = await executePartialTransfer(facilityId, input, userId);
        return { grn: partial.grn, movement: partial.movement };
      }
      ```
    - Sibling file `transfer-split.helper.ts` contains 138 lines implementing partial split-GRN creation (`applyPartialTransferSplit`, `resolvePartialTransferQty`).
    - Contract schema `transferOwnershipInputSchema` exposes optional `transferSmallBags`, `transferBigBags`, and `newGrnNumber`.
  - **Severity:** High (Direct violation of the established business rule: "Do not implement partial ownership transfers or split-GRN ownership transfers").
  - **Remediation Plan:**
    1. Reject partial transfer parameters in `transfer-ownership.handler.ts` (or eliminate `executePartialTransfer`).
    2. Enforce that transfer bag quantity matches the full available stock `bal.total`.
    3. Deprecate and remove `transferSmallBags`, `transferBigBags`, `newGrnNumber` from `transferOwnershipInputSchema`.
    4. Remove dead helper `transfer-split.helper.ts` and align test suites.

### Workflow E: Bag Types — Small, Big, and Hybrid
- **Files:**
  - `packages/contracts/src/bags.ts` (lines 1–237)
  - `packages/contracts/src/pricing.ts` (lines 45–100)
  - `packages/backend/src/modules/delivery/handlers/delivery-validation.helper.ts` (lines 1–70)
- **Analysis & Ground Truth:**
  1. **Small (`'S'`) & Big (`'B'`):** Stored directly in `smallBags` and `bigBags`. Single-type receipts enforce 0 on the opposite side.
  2. **Hybrid:**
     - Is Hybrid a persisted GRN `bagType`? **NO**. Persisted GRN `bagType` is strictly `'S' | 'B' | 'S+B' | 'S/B'`.
     - Hybrid is an **outward delivery and internal movement bag category / manual-pricing mode** (`isHybridBagCategory`, `packages/contracts/src/bags.ts:220`).
     - Operators use `'Hybrid'` (or alias `'Modern'`) when delivering lots at a custom per-bag rate (`bagPrice`), where `allocateHybridSplit` draws down small bags first from the available pool without forcing an artificial small/big split.

### Workflow F: Rent Collection and Rent Types
- **Files:**
  - `packages/contracts/src/pricing.ts`
  - `packages/contracts/src/rent-obligation.ts`
  - `packages/backend/src/modules/rent/rent.service.ts`
  - `packages/backend/src/modules/documents/templates/rent-receipt.template.ts`
- **Verified Business Rules:**
  1. **Seasonal:** Lump sum for the season (`months = 1`), never multiplied by 10.
  2. **Monthly:** Elapsed calendar cycles via `calculateMonthlyElapsedCycles`.
  3. **Collection:** Payments recorded via `recordPayment`, decrementing outstanding balance and generating a Cash Memo.

### Workflow G: Hamali Rate Configuration and Charging
- **Files:**
  - `packages/contracts/src/hamali.ts` (lines 1–47)
  - `packages/backend/src/modules/grn/handlers/create-grn.handler.ts`
  - `packages/backend/src/modules/grn/handlers/update-grn.handler.ts`
  - `packages/backend/src/modules/delivery/handlers/delivery-hamali.helper.ts`
- **Verified Rules:**
  1. Configured at Commodity Master level (`isHamaliApplicable: boolean`, `hamaliRate: number`).
  2. Formula: `calculateHamaliAmount(bags, hamaliRate) = bags * hamaliRate`. Never multiplied by duration.
  3. Proportional outward share via `allocateHamaliShare`.
  4. Repacking Hamali: Labor charge on merged bags: $B_{\text{moved}} \times \text{hamaliRate}$ added to `targetGrn.rentAmount`.

### Workflow H: Financial Documents
- **Files:**
  - `packages/backend/src/modules/documents/document.service.ts`
  - `packages/backend/src/modules/documents/templates/challan.template.ts`
  - `packages/backend/src/modules/documents/templates/rent-receipt.template.ts`
  - `packages/backend/src/modules/documents/templates/receipt.template.ts`
- **Verified Mappings:**
  1. **Delivery Challan & Gate Pass:** Rendered via `renderChallanTemplate`. Unified document title: "OUTWARD DELIVERY CHALLAN (GATE PASS)".
  2. **Cash Memo:** Rendered via `renderRentReceiptTemplate`. Unified document title: "CASH MEMO / RENT PAYMENT RECEIPT".
  3. **Inward Receipt:** Rendered via `renderReceiptTemplate`.

---

## 3. Code Quality & Integrity Inventory

| Finding Category | Severity | File Path & Symbol | Exact Line(s) | Description |
|---|---|---|---|---|
| **Culprit Logic / Zombie Code** | High | `packages/backend/src/modules/internal-movement/handlers/transfer-ownership.handler.ts` | 25–28 | Partial split-GRN ownership transfer branch violates the business rule requiring Full Transfer Only. |
| **Dead / Orphan Code** | Medium | `packages/backend/src/modules/internal-movement/handlers/transfer-split.helper.ts` | 1–138 | Sibling helper implementing partial split-GRN logic not exposed in UI and forbidden by business rule. |
| **Unused Contract Fields** | Low | `packages/contracts/src/internal-movement.ts` | 65–67 | `transferSmallBags`, `transferBigBags`, `newGrnNumber` on `transferOwnershipInputSchema`. |
| **Linter Warnings** | Low | `packages/backend/src/__tests__/e2e-multi-facility-lifecycle.test.ts` | 13:10 | Unused import `CommodityRateModel`. |
| **Linter Warnings** | Low | `packages/backend/src/__tests__/ledger-balance.test.ts` | 3:10 | Unused import `CommodityRateModel`. |
| **Test Fixture Drift** | Medium | `packages/backend/src/__tests__/bond-loan-lifecycle.test.ts` | 42–44, 73–74 | Seeded rates (smallRate 10) mismatch submitted payload (rentAmount 5000), causing fail-closed validation rejection. |

---

## 4. Prioritized Implementation Roadmap

Following repository governance ("One PR = one problem category; work in small reviewable PR-sized changes; every change must pass npm run build"):

### Phase 1 — Live Repository Baseline and Evidence Audit (THIS PR / PHASE)
- **Scope:** Repository verification, baseline audit across all 8 workflows, identification of dead/culprit split-GRN code, creation of dedicated branch `fix/live-inventory-rent-hamali-integrity`, and delivery of audit documentation.
- **Changes:** Documentation and branch creation only. Zero business logic or contract modifications.
- **Acceptance Criteria:** `npm run build` passes, working tree clean.

### Phase 2 — SSOT Contract & Linter Hygiene (Next PR)
- **Scope:**
  - Remove unused imports in test files (`e2e-multi-facility-lifecycle.test.ts`, `ledger-balance.test.ts`) so `npm run lint` passes with 0 warnings.
  - Deprecate/clean up dormant split-GRN fields (`transferSmallBags`, `transferBigBags`, `newGrnNumber`) in contracts.
- **Acceptance Criteria:** `npm run lint` passes with 0 warnings; `npm run build` passes.

### Phase 3 — Full Ownership Transfer Enforcement (Subsequent PR)
- **Scope:**
  - Enforce full available stock transfer validation in `transfer-ownership.handler.ts`.
  - Reject any transfer attempt where transfer quantity != `bal.total`.
  - Remove dead helper `transfer-split.helper.ts`.
  - Align `transfer-ownership-rent.test.ts` and `transfer-ownership-hamali.test.ts` to assert rejection of partial transfers.
- **Acceptance Criteria:** Backend tests pass; `npm run build` passes; full-transfer invariant strictly verified.

### Phase 4 — Test Fixture Alignment (Subsequent PR)
- **Scope:** Align legacy test suites (`bond-loan-lifecycle.test.ts`, `grn-manual-number.test.ts`) with seeded controller rates so the entire 129-file integration suite passes cleanly.
- **Acceptance Criteria:** All 129 test files pass.
