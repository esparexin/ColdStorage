# Task List: Clean Bag Type Composition Across Movements (Pending)

## Overview & Goal
Ensure that whenever bags are moved, sorted, merged, transferred, or outward-delivered (e.g., **GRN 4009** with **21 bags**), all notes, remarks, transaction logs, and UI tables cleanly and authoritatively record the bag type breakdown:
- **S/B lots:** `Small -<qty>, Big -<qty>` (e.g., `Small -5, Big -16`)
- **Hybrid lots:** `Hybrid -<qty>` (e.g., `Hybrid -21 merged into 4005`)

Strictly adheres to:
- One PR = One problem category
- No cross-cutting refactors
- No business logic or API contract changes
- Clean SSOT contracts, zero dead/alien/dummy code
- Full build and test verification (`npm run build`)

---

## Tasks / PR Roadmap

### ✅ PR 1: Merge Out & Merge In Notes & Remarks (DONE)
- **Status:** `DONE`
- **Scope:**
  - `packages/backend/src/modules/internal-movement/handlers/merge-grn.helper.ts`:
    - Implemented `formatMergeSourceAuditNote` formatting bag composition (`Small -<small>, Big -<big>, BagType: <type>` or `Hybrid -<total>`) in `sourceNote`.
    - Implemented `formatMergeSourceSummary` return string (used in `sourceSummaries` for target GRN `[MERGE RECEIVED...]`).
    - Updated `InventoryTransactionModel.create` outward transaction notes to include bag breakdown `(Small -<small>, Big -<big>)` or `(Hybrid -<total>)`.
  - `packages/backend/src/modules/internal-movement/handlers/merge-grn-movement.helper.ts`:
    - Recorded inward putaway transaction note with bag breakdown.
  - `packages/frontend/src/app/grns/components/internalMovementNotes.helper.ts`:
    - Enhanced table row mapping for `Merged Out` and `Merge In` to cleanly display composition (`Small -<qty>, Big -<qty>` or `Hybrid`).
  - **Verification:**
    - Unit tests in `merge-source-move.unit.test.ts` & `internalMovementNotes.helper.test.ts` covering 21 bags (`5 Small + 16 Big` and `21 Hybrid`).
    - Full workspace `npm run build` verified.

---

### ✅ PR 2: Sort Out & Repacking Remarks (DONE)
- **Status:** `DONE`
- **Scope:**
  - `packages/backend/src/modules/internal-movement/handlers/repack-grn.rent.ts`:
    - Updated `formatRepackAuditRemarks` to cleanly format outgoing lot composition (`Small -<small>, Big -<big>` or `Hybrid -<total>`) before the transition arrow and incoming lot composition (`S: <small> • B: <big>` or `Hybrid -<total>`).
  - `packages/backend/src/modules/internal-movement/handlers/repack-grn.handler.ts`:
    - Included bag breakdown in `tx-out` decant inventory transaction note and `tx-in` repacked putaway inventory note.
  - `packages/frontend/src/app/grns/components/internalMovementNotes.helper.ts`:
    - Enhanced repacking parser to extract `(Hybrid -<qty>)` cleanly.
  - **Verification:**
    - Unit tests in `repack-movement-history.unit.test.ts`, `internalMovementNotes.helper.test.ts`, and `structuredMovementsTable.helper.test.ts`.
    - Line budget audit passed (`bash scripts/hygiene-audit.sh`).
    - Full workspace `npm run build` verified.

---

### ✅ PR 3: Outward Delivery Notes & UI Formatting (DONE)
- **Status:** `DONE`
- **Scope:**
  - `packages/backend/src/modules/delivery/handlers/delivery-note.helper.ts`:
    - Created `formatOutwardDeliveryTxNote` to cleanly record structured bag composition (`Small -<small>, Big -<big>` or `Hybrid -<total>`) along with challan number and optional custom remarks.
  - `packages/backend/src/modules/delivery/handlers/create-delivery.handler.ts`:
    - Integrated `formatOutwardDeliveryTxNote` into `InventoryTransactionModel.create` note.
  - `packages/frontend/src/app/grns/components/grnOutwardDetails.helper.ts` & `GrnOutwardDetailsTable.tsx`:
    - Formatted bag composition to render `Small - <small>, Big - <big>` or `Hybrid - <total> bags`.
  - **Verification:**
    - Unit tests in `delivery-note.helper.test.ts` & `grnOutwardDetails.helper.test.ts`.
    - Line budget check passed (`bash scripts/hygiene-audit.sh`).
    - Full workspace `npm run build` verified.

---

### ✅ PR 4: Internal Transfer / Ownership Notes Alignment (DONE)
- **Status:** `DONE`
- **Scope:**
  - `packages/backend/src/modules/internal-movement/handlers/transfer-ownership.helper.ts`:
    - Standardized `alignTransferLedger` inventory transaction notes to include bag composition:
      - tx-out: `Ownership Transfer Out (Lot <grnNumber>): <total> bags (Small -<small>, Big -<big>)` or `(Hybrid -<total>)`
      - tx-in: `Ownership Transfer In (Lot <grnNumber>): <total> bags (Small -<small>, Big -<big>)` or `(Hybrid -<total>)`
  - **Verification:**
    - Unit tests in `transfer-ledger-notes.unit.test.ts`, `transfer-ownership-deed.unit.test.ts`, and `transfer-ownership-movement-history.unit.test.ts`.
    - Line budget check passed (`bash scripts/hygiene-audit.sh`).
    - Full workspace `npm run build` verified.
