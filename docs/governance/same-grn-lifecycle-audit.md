# Same-GRN Seasonal & Monthly Rent Lifecycle — Phase 0 Audit & Rule Lock

Branch: `feat/same-grn-seasonal-monthly-lifecycle` (from `origin/main` @ `0138c8a`).
Scope: read-only audit + documentation. No production behavior changes in this phase.

Baseline gates (pre-change):
- `type-check`: clean across all workspaces (after removing stale `packages/frontend/.next` artifact from unrelated branch).
- `hygiene`: PASS (line budget, architecture boundaries, a11y).
- Contracts tests: 12 files / 109 tests passed.

---

## 1. Non-negotiable rules (locked)

### Seasonal rent
- Seasonal rate per bag = total for the entire March–December season.
- `seasonal rent = applicable bags × seasonal rate per bag`.
- Example: `100 bags × ₹12 = ₹1,200`.
- The 10-month duration is informational only. Never multiply the seasonal rate by 10.

### Monthly rent
- Monthly rate per bag = one month's rent.
- `monthly rent = applicable bags × monthly rate per bag × billable months`.
- January and February use the applicable monthly pricing rules.
- Seasonal and monthly rates stay distinct even when numerically equal.

### Recurring billing (same GRN)
- One GRN keeps the complete history across seasons + intervening Jan/Feb periods.
- Initial seasonal rent lives on `grns.rentAmount`; every later period lives as a separate row in the existing `rentextensions` collection.
- Never overwrite prior periods, never silently reprice history, never mutate `rentpayments`.
- Outstanding rent stays pending until paid; duplicate billing/collection for the same obligation is prohibited.

### Price Controller
- One authoritative source for commodity-specific seasonal/monthly rates, incl. small/big splits.
- Inward Form displays rates read-only; backend validates against the authoritative configuration.

---

## 2. Audit findings (verified against source)

### 2.1 Contracts (`packages/contracts/src`)
| File | Finding |
|---|---|
| `pricing.ts:54-67` `calculateRentAmount` | Root `×10` defect: `Seasonal ? SEASONAL_RENT_MONTHS(10)`. Mixed + single-rate branches inherit it. Monthly `max(1,rentMonths)` correct. |
| `pricing.ts:88-89` `deriveBagPrice` | Seasonal `rentAmount/(bags*10)` wrong; must be `rentAmount/bags`. Monthly divisor correct. |
| `pricing.ts:25-35` `CANONICAL_BAG_RATES` + `resolveOutwardRates` | Rate lookup only (no months math) — keep. Values identical `{10,15}` for both types; must split into distinct seasonal/monthly stores in Phase 2. |
| `pricing.ts:98-101` `calculateMonthlyCharge` | Dead in prod (tests only). Remove only after consumer grep in Phase 7. |
| `pricing.ts:108-135` `deriveBillingCycle` + `:171-245` `calculateMonthlyOccupancy` | Monthly day-cycle + per-cycle `opening×rate` — keep semantics. |
| `rent.ts:208-209,143` `calculateSeasonalOccupancy` | Direct `totalBags*bagRate*10`, `seasonMonths=10` — must become `bags*rate`, months informational. |
| `rent-extension.ts:15` `extensionPeriodSchema` | Only `JANUARY\|FEBRUARY` — cannot represent seasonal renewal. Phase 4 adds minimum `SEASON` identifier after compatibility check. |
| `rent-extension.ts:26-50` season helpers | `seasonYearForInwardDate`, `extensionSnapshotDate(Jan01/Feb01)`, `calculateExtensionRent(snapshot*rate)` 1-mo — keep; add Mar01 snapshot for `SEASON`. |
| `grn-rent.ts:7-9` `SEASONAL_RENT_MONTHS` | Forces `10` into all call sites. Deprecate from math in Phase 1; retain display-only if needed. |
| `grn.ts:89-104` create refine | Seasonal must omit `rentMonths` on input but stored as `10` — storage/input asymmetry documented, normalized in Phase 1. |

### 2.2 Backend
| Area | Files | Finding |
|---|---|---|
| GRN create/edit | `modules/grn/handlers/create-grn.handler.ts:76`, `grn-edit-rent.ts:65,98-139` | Stores `rentMonths=10`, calculates + derives with `×10/÷10`. Phase 1/4 fix; keep structural-lock guards. |
| Delivery outward | `modules/delivery/handlers/create-delivery.handler.ts:108-130` | `calculateRentAmount` injects `×10` for Seasonal + `10 mos season` message. Must use corrected SSOT. |
| Occupancy | `modules/common/occupancy-rent.ts:31-102` | `deriveBagPrice ÷10` then `×10`; single-rate loses S+B split. Must source controller rate directly. |
| Extension finalize | `modules/rent/rent-extension.service.ts:29-159` | Idempotent per `(facility,grn,seasonYear,period)` + duplicate-key read; `snapshot.total<=0` reject; `Grn.rentAmount` untouched — keep pattern. Defects: guard `:43` (`seasonYear===origin`) blocks renewal → relax to `>=origin`; `bagRate` via `÷10` + ignores small/big → source controller monthly/seasonal rate. |
| Summary/balance/collect | `rent-summary.helper.ts:21-64`, `common/rent-balance.ts:24-36`, `handlers/record-payment.handler.ts:35-171`, `rent-extension.repository.ts:81-92` | Single balance engine `totalDue=baseRent+sum(extensions)`, `remaining=max(0,due-paid)`, overpay reject, close only if `bags==0 && balance==0`. Keep; Phase 5 verifies multi-period reconciliation, no second engine. |
| Receipt/reports | `rent.service.ts:132-194`, `storage-audit-report.ts`, `documents/templates/rent-receipt.template.ts:40` | `Fixed 10-Month Season` fallback + `×10` labels need reword; receipt `totalDue` already pooled — keep shape. |
| Commodity | `modules/commodities/commodity.service.ts`, `database/models/commodity.model.ts` | Name-only `{id,name,normalizedName,isActive}`. Rate master is config, not a second rent ledger — Phase 2 adds minimum persistent rates with existing DB conventions. |
| Models/indexes | `rent-extension.model.ts:33,53`, `rent-payment.model.ts`, `database/indexes.ts` | `period enum` needs `SEASON`; unique `(facility,grn,seasonYear,period)` already prevents double-bill — extend, don't replace. `RentExtension` missing from monitored models — add. |

### 2.3 Frontend
| Area | Finding |
|---|---|
| Inward `CreateGrnModal.tsx`, `useCreateGrnForm.ts:44-45`, `CustomerAgreedRateSection.tsx:50-100` | Editable `small/bigBagPrice` number inputs, commodity does not drive rates. Phase 3 → read-only from controller + loading/error/retry, block submit without rate; remove unused state only after consumer check. |
| GRN detail / rent terms `GrnDetailModal.tsx:191-211`, `RentTermsCell.tsx:66-203` | `termMonths=10`, `deriveBagPrice ÷10`, `×Nm` formula, `10 months` label — reword to seasonal-total in Phase 6. |
| Delivery `deliveryRent.helper.ts:37-58`, `DeliveryBagCompositionFields.tsx` | Mirrors backend `×10` + `10 mos season` string — consume corrected SSOT in Phase 5/6. |
| Rent UI `RentTable`, `RentSummaryOverview`, `RentHistoryModal`, `CollectPaymentModal`, `useRentData`, `rentDisplay.helper.ts` | `Dynamic` vs fixed branching correct in shape; must distinguish initial season / renewal / Jan / Feb / payments / pending in Phase 6 using existing shared UI + formatters. |
| Settings `PricingExplainerSection.tsx`, `pricingExamples.ts:26-60` | Read-only explainer; hard-coded `×10 months` formula strings update in Phase 6. |
| API client | `lib/api-client.ts` `requestWithAuth` + facilities/settings contexts — reuse for rate lookup; no new client infra. |

### 2.4 Test fixtures locking old math (update in Phase 1/5/7, not here)
`pricing.contracts.test.ts:13-87` (`10000`, `9600`), `rent.contracts.test.ts:190-191` (`15000`), `delivery-outward-rent*.test.ts`, `deliveryRent.helper.test.ts`, `occupancy-rent.test.ts:118-155`, `chamber-rental-customer.test.ts:28-31`, `master-data-fixtures.ts:96` (`SEASONAL_MONTHS=10`), `rent-fixtures.ts:145`.

---

## 3. Business decisions (locked for implementation)

1. Seasonal renewal snapshot: month-start remaining bags (Mar01 `readLedgerBalanceAsOf`, same rule as Jan01/Feb01). If zero remaining → no seasonal renewal due (consistent with `snapshot.total<=0` reject).
2. Renewal rate: current Price Controller seasonal rate at finalization time (recorded immutably on the period row as `bagRate`/`calculatedAmount`). Original `grns.rentAmount` (season 1) never mutated.
3. Small/big: `(s×sRate + b×bRate)` uniformly for seasonal, monthly, Jan/Feb, and renewal. Single `bagPrice` only when bag-type config provides no split. Extension/occupancy single-rate paths fixed to preserve split.
4. `seasonYear`: year owning Mar–Dec (`seasonYearForInwardDate` unchanged). `SEASON(seasonYear)` covers Mar–Dec `seasonYear`; `JANUARY/FEBRUARY(seasonYear)` cover Jan/Feb `seasonYear+1`. Same `grnId` spans successive `seasonYear` values; `input.seasonYear >= originSeason` allowed.
5. Migration: no automatic repricing/backfill/reversal of history. Phase 7 produces read-only impact report for `×10`-era obligations; any correction is a separately reviewed, idempotent, audited operation.

---

## 4. Dependency map (modify only via canonical SSOT)

```
contracts/pricing.ts (calculateRentAmount, deriveBagPrice, resolveOutwardRates, occupancy)
  ← backend: create-grn, grn-edit-rent, create-delivery, occupancy-rent, rent-extension.service
  ← frontend: deliveryRent.helper, RentTermsCell, pricingExamples
contracts/rent-extension.ts (period, seasonYear, snapshot, totalRentDue)
  ← backend: rent-extension.service/repository, rent-summary.helper, record-payment.handler, rent.service
  ← frontend: rent history/summary components (display only)
contracts/rent.ts (summary/occupancy DTOs) ← backend rent.service, storage-audit-report, receipts
```

No new rent ledger. Rate master is the only new persistence; all math flows through `contracts/`.

---

## 5. Test matrix (phases in parentheses)

- Seasonal total: `100×12=1200`, S+B `(60×10+40×15)=1200` (P1).
- Monthly: `100×12×1=1200`, `×2=2400`; duration passthrough unchanged (P1).
- Renewal same GRN: `S2026 + Jan26 + Feb26 + S2027` each recorded once; retry returns existing (P4).
- Snapshot zero → no due, error surfaced (P4).
- Partial payments carry `pending=due-paid` across periods; overpay rejected; receipts/audit continuous (P5).
- Rate tamper (stale/foreign rate) → 400 (P2/P3).
- Uniqueness concurrency: parallel finalize same period → one row (P4/P7).
- Displays: initial/renewal/Jan/Feb/payments/pending distinguishable, responsive + keyboard + loading/empty/error (P3/P6).
- Hygiene: no duplicate ledgers/formulas, no dead paths without usage proof (P7).
- Gates: type-check, lint, unit/contract, API/integration, builds, e2e (Inward→renewal→collect→history→receipt), security/authz, index/migration validation, manual a11y (P8).
