# Inward → Rent → Delivery Challan → GRN Flow Audit

**Branch:** `feat/inward-rent-delivery-grn-flow`
**Base:** `fix/grn-ui-ux-submission-flow`
**Date:** 2026-10-03
**Status:** AUDIT ONLY — no behavior changed in this phase.

## 1. SSOT (`packages/contracts/src`)

* `index.ts:1-20` re-exports all domains. Consumed as `@cold-storage/contracts` (Zod).
* `grn.ts:47-121` — `CreateGrnInput`, `Grn{rentType,rentMonths,rentAmount,status:OPEN|CLOSED}`. Rent terms are operator input, not a rate engine.
* `rent.ts:10-68` — `RecordRentPaymentInput{grnId,amountPaid>0,mode:Cash|UPI}`, `RentSummaryDto{rentAmount,totalPaid,remainingBalance,paymentStatus:Settled|Not Settled,payments[]}`, `RecordRentPaymentResult{payment,summary}`.
* `delivery.ts:26-92` — `CreateDeliveryInput{grnId,items[]}`, `DeliveryChallan{status:ISSUED|REVERSED}`. No payment fields.
* `inventory.ts:19-36` — `CreatePutAwayInput{items[1..50]}`.
* `permissions.ts:10-38` — `rent:collect/view/print`, `grn:create`, `delivery:create`. No `grn:close` route in use.
* `documents.ts:55-180` — print DTOs only (`html` format lock).

State machines: `GRN OPEN→CLOSED` auto on bag depletion (`00-p0-lock.md:174-176`); `Rent Not Settled→Settled` derived (`rent.service.ts:67-68`); `Delivery ISSUED→REVERSED` full-reversal only.

## 2. Backend (`packages/backend/src`)

| Flow | Route | Service / Handler | State check today |
|---|---|---|---|
| Inward (=GRN) | `routes/grn.routes.ts:15-54` `POST /facilities/:fid/grns` | `modules/grn/handlers/create-grn.handler.ts:19-175` → `GrnModel(status:OPEN)` | facility/customer/commodity/chamber + FY/30d/5min guards |
| Rent collect | `routes/rent.routes.ts:15-54` `POST /:fid/rent/collect` | `modules/rent/handlers/record-payment.handler.ts:32-140` (write-lock, `getTotalPaidForGrn`, overpay reject, `RCPT-FY-####`, immutable `rent-payment.model.ts:49-81`) | `amountPaid<=remaining`, future-date, FY uniqueness |
| Rent summary | `routes/rent.routes.ts:57-74` `GET /:fid/rent/grn/:identifier` | `rent.service.ts:60-89` derives `Settled/Not Settled` | read-only |
| Put-away | `routes/inventory.routes.ts:15-69` `POST /:fid/grns/:grnId/allocations` | `handlers/allocate-stock.handler.ts:60-190` | only `GRN is OPEN` — **no rent check** |
| Delivery | `routes/delivery.routes.ts:17-71` `POST /:fid/deliveries` | `handlers/create-delivery.handler.ts:52-198`, `delivery-validation.helper.ts:1-231` | only `CLOSED`, stock, FY/date — **no rent check** |
| GRN completion | — (no close route) | auto-`CLOSED` in `create-delivery.handler.ts:171-173`, reopen in `reverse-delivery.handler.ts:172-174` | bag balance `==0` |

No gateway/webhook. `Cash|UPI` enum only. No duplicate payment services.

## 3. Frontend (`packages/frontend/src`)

App Router, modal-driven. No `services/`, no stores. Global `AuthContext`, `FacilityContext`, `SettingsContext` in `app/layout.tsx:24-31`. Client `requestWithAuth` in `lib/api-client.ts`.

* `/grns` (`app/grns/page.tsx`) → `CreateGrnModal` + `useCreateGrnForm.ts:98,155` → `POST /grns`.
* `/inventory?grnId=` (`app/inventory/page.tsx:20,24`) → `usePutAway:140` → `POST /allocations`, `useInventoryData:28` → `GET /grns?status=OPEN`.
* `/deliveries` (`app/deliveries/page.tsx`) → `CreateDeliveryModal` + `useCreateDeliveryForm.ts:27,42,79` (`GET grns?status=OPEN`, `GET inventory-summary`, `POST deliveries`).
* `/rent` (`app/rent/page.tsx:32-45`) → `RentTable Collect/Receipts` → `CollectPaymentModal` + `useCollectPaymentForm.ts:27,48` → `POST /rent/collect`, `useRentData.ts:19,30,43` (N+1 summary fetch).

Zero `rent/Settled` refs in `app/deliveries/*`. Zero `returnUrl|router.push|redirect` repo-wide. Post-payment only closes modal + refetch. Prints via `window.open('',_blank)`.

Apparent duplicates that are **not** duplicates: header `create-*-btn` vs empty-state `create-*-empty-btn` (same modal, two entry points); table print vs detail print (same `GET /documents/*` handler, two surfaces). No parallel payment implementations.

## 4. Gaps vs required `Inward → Rent → Delivery → GRN`

1. No backend rent gate on put-away or delivery.
2. No frontend rent check before delivery/put-away draft.
3. No pending-intent return: after `POST /rent/collect` from any context other than `/rent`, context is lost.
4. No manual `Complete GRN` — completion is derived auto-`CLOSED`. Treated as non-goal unless governance approves a new close endpoint (would violate reuse constraint).

## 5. Minimum changes (reuse only, approved for Phases 2-4)

* Backend: one shared `require-rent` read helper on `rent.service` + call at top of `executeDeliveryTransaction` and `executePutAwayTransaction`. Hard-block only when `totalPaid==0 && rentAmount>0` (`409 RENT_PAYMENT_REQUIRED` + `RentSummaryDto`); partial (`paid>0, remaining>0`) returns `rentWarning` and proceeds. No new DTO, no new model, no gateway.
* Frontend: one `useRentGate(grnId)` reusing `GET /rent/grn/:id`; `useCreateDeliveryForm` + put-away submit check gate before `POST`; pending-intent state reuses existing `CollectPaymentModal` + `useCollectPaymentForm`; on success resume preserved draft. No new route, no new payment hook, no duplicated `POST /rent/collect`.
* Phase 4: no new GRN API. Delivery summary already links `grnId/grnNumber`; GRN detail already links `inventory?grnId=`. Only ensure rent warning surfaces in final-delivery path that triggers auto-`CLOSED`.
* Phase 5: no component deletions beyond gating UI; keep both entry buttons (header + empty) as they share one modal.

## 6. Operational note: CI only schedules `main`-gated workflows for PRs targeting `main`

`ColdStorage CI`, `Governance Validation`, `Governance Health Check`, `Playwright Tests`, `Security Audits`, `CodeQL Advanced`, and `Commitlint` all gate `pull_request` on `branches: [main]`. A PR opened against any other base runs only `DangerJS Governance` (+ skipped `Dependabot Updates`) until it targets `main` and receives an `opened`/`synchronize`/`reopened` event. Open flow PRs directly against `main`.

## 7. Addendum 2026-10-05 — single-ledger stock authority (`feat/ledger-stock-authority`)

The put-away workflow this audit describes no longer exists, and the stale references in
§1–§5 should be read accordingly:

- §1 `CreatePutAwayInput`, §2 `POST /:fid/grns/:grnId/allocations` +
  `allocate-stock.handler.ts`, §3 `usePutAway` + `POST /allocations` + the `/inventory` page:
  all retired with the storage hierarchy. There is no allocation step and no separate
  `INWARD_PUTAWAY`-less stock source.
- The inward receipt now writes its own `INWARD_PUTAWAY` ledger row (same transaction), so the
  ledger is self-sufficient: inward adds, outward removes, reversal restores.
- Every balance — delivery guard, summaries, dashboard, exports, rent receipt print — derives
  from `modules/inventory/ledger-balance.ts`, the single derivation. The `GRN − challans`
  formula and both `hasLedgerTxns` source switches are deleted.
- Bag movement is a composition (`smallBags` + `bigBags`) end to end: receipts, challans and
  ledger rows all carry the split, and the delivery guard enforces each side separately.
- The rent gate the audit called for (§4 gaps, §5) exists as `rent-gate.service.ts` (402
  `RENT_PAYMENT_REQUIRED` when `rentAmount > 0` and nothing is paid; partial payment proceeds).
  Rent collection itself is unchanged: `grns.rentAmount` stays frozen at inward, and outward
  movement never mutates it.
- GRN correction keeps an audit trail and now propagates the chamber label to the receipt's
  ledger rows and challans; bags/commodity corrections are refused once stock has moved.
