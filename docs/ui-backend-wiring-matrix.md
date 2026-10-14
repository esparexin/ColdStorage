# UI ↔ Backend Wiring Matrix (SSOT)

> Branch: `feat/grn-stock-bonds-separation` · Date: 2026-10-05
> Rule: every interactive element must map to a real backend route + contract schema.
> No frontend-only actions. Prop-based detail modals are intentional (no new single-GET fetches).

## 1. Frontend inventory

- Framework: Next.js 14 App Router, `src/app/*/page.tsx`, `next.config.mjs` rewrites `/api/:path*` → backend `:4000/api/:path*`.
- Routes (14): `/`, `/grns`, `/deliveries`, `/rent`, `/grn-stock`, `/bonds`, `/customers`, `/commodities`, `/settings`, `/import-export`, `/audit`, `/backup`, `/users`, `/groups`. (`/bond-ledger`, `/inventory`, and `/storage` are retired; chamber is free text.)
- Primitives (`components/ui/index.ts`, 16): `Button`, `Input`, `Select`, `Badge`, `Card`, `StatCard`, `SearchBar`, `FilterToolbar`, `Modal`, `ConfirmDialog`, `Pagination`, `DataTable`, `FeedbackStates`, `Banner`, `OverflowMenu` + `stateCopy.ts`.
- Client: `lib/api-client.ts` (`requestWithAuth` + single-flight `POST /api/auth/refresh`, Bearer memory-only, `credentials:include`).
- Contexts: `AuthContext` (login/logout/change-password), `FacilityContext` (`GET /api/facilities`), `SettingsContext` (`GET /api/settings`).

## 2. Design-system adoption (verified)

| Primitive | Status | Evidence |
|---|---|---|
| `Button` | ✅ enforced | Canonical DS Button across all action, form, and modal submits; compact `.actionBtn` overrides removed (rely on `size="sm"`) |
| `Input` | ⚠️ partial | Login, password-change, customer/commodity/facility modals migrated; `.fieldInput` copies in GRN/delivery/rent/loan forms remain token-compliant and migrate progressively |
| `Select` | ✅ enforced | Bound by boundary governance Rule 11 (zero native `<select>` outside `ui/Select.tsx`) |
| `Card` | ✅ single surface | The one bordered-surface recipe. Wraps content groups in import-export and Settings; deliberately never wraps a `DataTable`, which already draws its own surface |
| `SearchBar` | ✅ toolbars | Canonical search bar primitive across filter toolbars |
| `Modal/DataTable/Badge/Pagination/FeedbackStates` | ✅ consistent | Modals, tables, status badges, and feedback states unified |

## 3. Route ↔ API wiring (all verified against `backend/src/routes/*.ts` + `contracts/src/*.ts`)

| UI action | Frontend call | Backend route | Contract | Verdict |
|---|---|---|---|---|
| Login / logout / change-password / bootstrap | `POST /api/auth/login`, `requestWithAuth(/api/auth/logout)`, `(/api/auth/change-password)`, `POST /api/auth/refresh` | `auth.routes.ts` | `loginInputSchema`, `changePasswordInputSchema` | ✅ wired |
| Facility switch / list / create / patch | `GET /api/facilities`, `POST /api/facilities`, `PATCH /api/facilities/:id` (`FacilityFormModal.tsx:36`) | `facility.routes.ts` | `createFacilitySchema`, `updateFacilitySchema` | ✅ wired |
| Customers list/create/patch | `GET /api/customers?facilityId=`, `POST /api/customers`, `PATCH /api/customers/:id` (`CustomerFormModal:77`) | `customer.routes.ts` | `createCustomerSchema`, `updateCustomerSchema` (PATCH, not PUT) | ✅ wired |
| Commodities list/create/patch | `GET /api/commodities`, `POST/PATCH /api/commodities[/:id]` | `commodity.routes.ts` | `create/updateCommoditySchema` | ✅ wired |
| GRNs list/create/correct/print/loan-status | `GET .../grns?...`, `POST .../grns`, `PATCH .../grns/:gid` (`CreateGrnModal` mode="edit"), `GET .../documents/grn|receipt/:id`, `PATCH .../grns/:gid/loan-status` (`UpdateLoanStatusModal`) | `grn.routes.ts`, `document.routes.ts` | `createGrnSchema`, `grnQuerySchema`, `correctGrnSchema`, `updateGrnLoanStatusSchema`, `documentFormatQuerySchema` | ✅ wired |
| Inventory summary / ledger / movement | `GET .../grns/:gid/inventory-summary` (`useCreateDeliveryForm`), `GET .../grns/:gid/movement-history` (grn-stock), `GET .../rent/grn/:id` (rent/delivery) | `inventory.routes.ts`, `grn.routes.ts`, `rent.routes.ts` | `stockLedgerQuerySchema` | ✅ wired (ledger-derived balances; `/allocations`, `/put-away`, `/positions/*` retired) |
| Deliveries list/create/detail/reverse/print | `GET .../deliveries?...`, `POST .../deliveries`, `POST .../deliveries/:id/reverse`, `GET .../documents/challan/:id` | `delivery.routes.ts` | `createDeliverySchema`, `reverseDeliverySchema`, `deliveryQuerySchema` | ✅ wired for list/create/detail/print (detail modal prop-based by design). **`POST .../deliveries/:id/reverse` has NO frontend caller** - it is an API-only capability gated on `delivery:reversal` and covered by backend tests. |
| Rent collect/history/print-preview/print | `POST .../rent/collect`, `GET .../rent/grn/:id`, `GET .../documents/rent-receipt/preview`, `GET .../rent/receipts/:n/print` | `rent.routes.ts`, `document.routes.ts` | `recordRentPaymentInputSchema` | ✅ wired |
| Users provision/list/update/reset | `GET /api/users?page&limit`, `POST /api/users` (`useUsersData:23`, `useProvisionUserForm:57`), `PATCH /api/users/:id` + `POST /api/users/:id/reset-password` (`useUserLifecycle:54,92`) | `user.routes.ts` (SUPER_ADMIN only) | `createUserSchema`, `paginationSchema`, `updateUserSchema`, `resetUserPasswordSchema` | ✅ wired |
| Audit list | `GET /api/audit-logs?...` (`useAuditLogs:34`) | `audit.routes.ts` | `auditQuerySchema` | ✅ wired (detail prop-based) |
| Backup trigger/list/status | `POST /api/backups/trigger`, `GET /api/backups?...`, `GET /api/backups/status` | `backup.routes.ts` | `backupTriggerSchema`, `backupQuerySchema` | ✅ wired |

## 4. Addendum — same-GRN seasonal/monthly lifecycle (`feat/same-grn-seasonal-monthly-lifecycle`)

| UI action | Frontend call | Backend route | Contract | Verdict |
|---|---|---|---|---|
| Commodity rate lookup (Inward read-only rates) | `GET /api/commodities/:id/rates?rentType=` (`useCommodityRate`) | `commodity.routes.ts` | `commodityRateQuerySchema`, `commodityRateSchema` | ✅ wired |
| Commodity rate upsert (managers only) | `CommodityRatesModal` → `PUT /api/commodities/:id/rates` via `useCommodityRates` (Rates action, `commodity:manage`-gated) | `commodity.routes.ts` (`commodity:manage`) | `upsertCommodityRateSchema` | ✅ wired |
| Inward with controller rates | `POST .../grns` (read-only agreed rates from lookup) | `grn.routes.ts` (mismatch → 400, unconfigured → legacy path) | `createGrnSchema` | ✅ wired |
| Billing-period history & extension display | `RentHistoryModal` and `RentCashMemosTab` display over `RentSummaryDto.extensions/totalDue` | `rent.routes.ts` (`GET .../rent/grn/:id`) | `rentSummaryDtoSchema`, `rentExtensionSchema` | ✅ wired (display only; finalization/override writes are headless REST APIs) |
| Settings get/put + logo | `GET/PUT /api/settings`, `POST/DELETE /api/settings/logo`, `GET /api/assets/:id` (`AppHeader`, `BrandLogoSection`) | `settings.routes.ts`, `asset.routes.ts` | `systemSettingsSchema` | ✅ wired |
| Import / Export | `POST .../import/customers|grns` (FormData `file`), `GET .../export/grns|deliveries|inventory-ledger|customers|stock-summary` | `import-export.routes.ts` | `exportDateRangeQuerySchema`, `stockSummaryExportQuerySchema` | ✅ wired |
| Dashboard summary | `GET .../dashboard/summary` | `dashboard.routes.ts` | `dashboardSummarySchema` | ✅ wired |

No frontend call targets retired endpoints (`/api/storage/*`, `/api/chambers/*`, PUT customers). Dynamic `documents/${type}` constrained to `grn|receipt`; `import/${target}` constrained to `customers|grns`; `export/${endpoint}` callers pass only the 5 canonical types.

## 5. Headless REST API Endpoints (Retained & Fully Tested)

Per architecture governance, the endpoints below are intentionally retained as headless REST API capabilities (implemented, routed inline in `*routes.ts`, and covered by backend tests). Detail modals in the web UI reuse list entity props to avoid redundant network round-trips. Delivery reversal remains API-only: `POST .../deliveries/:id/reverse` is implemented and tested but has no UI. (An earlier revision of this document claimed it was 'wired via DeliveryReversalModal in deliveries/page.tsx'; that component never existed and the claim was removed in W4/W6.) There is no gate-pass endpoint (balances are ledger-derived).

| # | Endpoint & Method | Handler / Module | Contract Schema | Capability / Purpose |
|---|---|---|---|---|
| 1 | `PATCH /api/facilities/:fid/grns/:gid` | `grn.routes.ts:192` (inline) | `correctGrnSchema` | GRN receipt quantity/weight post-creation administrative correction — canonical Inward Edit API, consumed by `CreateGrnModal` (mode="edit") (`GrnTable`/`GrnDetailModal` entry points); `loan-status` is a separate modal/contract |
| 2 | `GET /api/grns/:grnId/acknowledgement` | `grn.routes.ts:129` (inline) | `grnParamsSchema` | Machine-readable JSON acknowledgement of inward receipt |
| 3 | `GET /api/facilities/:fid/grns/:gid/deliveries` | `delivery.routes.ts:180` (inline) | `grnParamsSchema` | Direct outward delivery history query for a specific GRN (bond-ledger uses `movement-history` instead) |
| 4 | `GET /api/facilities/:fid/inventory`, `/inventory/ledger`, `/inventory/customer/:cid`, `GET .../rent/occupancy-report` | `inventory.routes.ts`, `rent.routes.ts:120` (inline) | `stockLedgerQuerySchema` | Facility rollups retained API-only; UI reads `inventory-summary` + `movement-history` + `rent/grn/:id` |
| 5 | `GET /api/customers/:id` | `customer.routes.ts:59` (inline) | `customerParamsSchema` | Programmatic single-customer entity lookup (UI modals are prop-based by design) |
| 6 | `GET /api/commodities/:id` | `commodity.routes.ts:38` (inline) | `commodityParamsSchema` | Programmatic single-commodity entity lookup (UI modals are prop-based by design) |
| 7 | `GET /api/audit-logs/:id` | `audit.routes.ts:60` (inline) | `auditParamsSchema` | Forensic single audit log entry lookup by immutable ID (UI modal is prop-based by design) |
| 8 | `POST /api/facilities/:fid/rent/extensions/finalize`, `PATCH .../override`, `GET .../extensions` | `rent.routes.ts:150,188,218` (inline) | `finalizeExtensionInputSchema`, `overrideExtensionInputSchema` | Recurring billing extension finalization & authorized override (headless REST capability; UI displays finalized extensions) |


## 6. Fixed in this branch (no new features)

1. UI tokens: removed compact `.actionBtn` overrides (`grns/deliveries/page.module.css`) in favour of DS `Button size=sm`; replaced hardcoded `11px/10px` cell text with `var(--text-xs)`; replaced `gap:1/2/3px`, `margin/padding px` with `var(--space-*)`; removed hex fallbacks (`BondLoanSection`); fixed non-existent tokens (`--color-surface-3` → `--color-surface-2`, `--color-danger-border` → `--color-danger`, `--space-2-5` → `--space-2`, `letter-spacing:0.5px` → `var(--tracking-label)`); corrected fill-vs-text roles (`--color-primary/success/warning` → `*-text` for text).
2. Contracts: `useProvisionUserForm` mobile regex now delegates to `indianMobileSchema`; `deliveries/page.tsx` rent lookup now uses `requestWithAuth` (was bare `fetch` without refresh); `record-payment.handler` post-payment balance + audit status now derive from `computeRentBalance`; rent-receipt preview derives status from `computeRentBalance`; fixed stale `counter.service` comment.
3. Hygiene: deleted dead `bag-composition.ts` (zero importers; `ledger-polarity.ledgerBagQuantity` is canonical) and orphan `grn/queries/grn-movement-history.queries.ts` shim; removed dead `inventory.mappers isTransientError` re-export and dead `isDatabaseConnected`; uninstalled alien `cookie-parser` dep; corrected a false claim that delivery reversal was UI-wired (it is API-only); corrected a claim that `useRentGate.rentBlocked` exists (it does not); fixed stale comments; fixed `e2e/ui-density` mocks to real `/api/facilities|audit-logs|backups|customers|commodities|users` paths and added `/bond-ledger`.
4. Line budget: extracted `DeliveryPageModals` so `deliveries/page.tsx` stays ≤250 lines.

## 5.1 Business-Key SSOT: GR No. (`grnNumber`)

`grnNumber` is the sole business key for the whole goods and financial lifecycle:
Inward → GR No. → GRN Stock → Delivery-Out → Closing → Rent/Payment → Loan → Cash Memo.

- **Search/lookup**: `grn.service` searches on `grnNumber` only. `inwardReceiptNumber` and
  `bondNumber` were removed from the GRN `$or` clause; they are reference text, not keys.
  Rent lookups continue to accept `id` or `grnNumber` via the canonical `resolveGrn` pattern.
- **Sorting/grouping**: no sort or grouping uses `inwardReceiptNumber` or `bondNumber`.
- **Minting**: RCPT (`inwardReceiptNumber`) is still generated for the inward receipt. BND
  (`bondNumber`) is **no longer minted per receipt** — Bond # displays the GR Number instead.
- **Storage Mark / Bond #**: no stored copies. `TransportLogisticsSection`, `BondLoanSection`,
  `BondDetailsModal`, `bondsColumns`, `GrnDetailModal` and `GrnTable` all render `grnNumber`
  in those positions.
- **Exports**: `GRN_EXPORT_HEADERS` keeps `inwardReceiptNumber` as a historical column with
  `grnNumber` first; `GRN_IMPORT_*_HEADERS` are unchanged so legacy CSV import keeps working.
- **Loan fields**: the free-text lender name / pledge account / notes trio is retired from
  `updateGrnLoanStatusSchema` and its UI. Settlement remains the single capture point for loan
  payment details and notes (`loanSettlementInputSchema` + `LoanSettlementFields`), including the
  bank-transfer rail fields the contract requires.
- **Enforced by** `check-architecture-boundaries.sh` Rule 23.

## 6. Remaining tracked (progressive, not in this PR)

- Migrate remaining `.fieldInput` form copies to DS `Input` one route at a time (currently token-compliant; no new primitive needed).
- Consider `eslint-plugin-jsx-a11y` as lint enforcement; extend e2e beyond mocks (rent collect/print, reversal, ledger).
- Print template `renderPassbookHtml.ts` intentionally keeps standalone print CSS (hex/px) for print fidelity; excluded from screen-token rules. `StatCard` 1px hairline gap is intentional (border divider technique).

## 7. Verification

- `npm run type-check` ✅ · `npm run lint` ✅ · `npm run test` (contracts) ✅
- `bash scripts/check-architecture-boundaries.sh` ✅ · `bash scripts/check-line-budget.sh` ✅
- `npm run hygiene` ✅ · Manual: every button click-path in §3 traced to handler + endpoint; loading/disabled states preserved.
