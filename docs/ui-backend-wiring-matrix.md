# UI ↔ Backend Wiring Matrix (SSOT)

> Branch: `chore/ui-ux-ssot-root-cause-cleanup` · Date: 2026-10-06
> Rule: every interactive element must map to a real backend route + contract schema.
> No frontend-only actions. Prop-based detail modals are intentional (no new single-GET fetches).

## 1. Frontend inventory

- Framework: Next.js 14 App Router, `src/app/*/page.tsx`, `next.config.mjs` rewrites `/api/:path*` → backend `:4000/api/:path*`.
- Routes (12): `/`, `/grns`, `/deliveries`, `/rent`, `/bond-ledger`, `/customers`, `/commodities`, `/settings`, `/import-export`, `/audit`, `/backup`, `/users`. (`/inventory` and `/storage` are retired; chamber is free text.)
- Primitives (`components/ui/index.ts`, 15): `Button`, `Input`, `Select`, `Badge`, `Card`, `StatCard`, `SearchBar`, `FilterToolbar`, `Modal`, `ConfirmDialog`, `Pagination`, `DataTable`, `FeedbackStates`, `Banner` + `stateCopy.ts`.
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
| GRNs list/create/print/loan-status | `GET .../grns?...`, `POST .../grns`, `GET .../documents/grn|receipt/:id`, `PATCH .../grns/:gid/loan-status` (`UpdateLoanStatusModal`) | `grn.routes.ts`, `document.routes.ts` | `createGrnSchema`, `grnQuerySchema`, `updateGrnLoanStatusSchema`, `documentFormatQuerySchema` | ✅ wired |
| Inventory summary / ledger / movement | `GET .../grns/:gid/inventory-summary` (`useCreateDeliveryForm`), `GET .../grns/:gid/movement-history` (bond-ledger), `GET .../rent/grn/:id` (rent/delivery/bond-ledger) | `inventory.routes.ts`, `grn.routes.ts`, `rent.routes.ts` | `stockLedgerQuerySchema` | ✅ wired (ledger-derived balances; `/allocations`, `/put-away`, `/positions/*` retired) |
| Deliveries list/create/detail/reverse/print | `GET .../deliveries?...`, `POST .../deliveries`, `POST .../deliveries/:id/reverse`, `GET .../documents/challan/:id` | `delivery.routes.ts` | `createDeliverySchema`, `reverseDeliverySchema`, `deliveryQuerySchema` | ✅ wired (detail modal prop-based by design; reversal gated on `delivery:reversal`, wired via `DeliveryReversalModal` in `deliveries/page.tsx`) |
| Rent collect/history/print-preview/print | `POST .../rent/collect`, `GET .../rent/grn/:id`, `GET .../documents/rent-receipt/preview`, `GET .../rent/receipts/:n/print` | `rent.routes.ts`, `document.routes.ts` | `recordRentPaymentInputSchema` | ✅ wired |
| Users provision/list/update/reset | `GET /api/users?page&limit`, `POST /api/users` (`useUsersData:23`, `useProvisionUserForm:57`), `PATCH /api/users/:id` + `POST /api/users/:id/reset-password` (`useUserLifecycle:54,92`) | `user.routes.ts` (SUPER_ADMIN only) | `createUserSchema`, `paginationSchema`, `updateUserSchema`, `resetUserPasswordSchema` | ✅ wired |
| Audit list | `GET /api/audit-logs?...` (`useAuditLogs:34`) | `audit.routes.ts` | `auditQuerySchema` | ✅ wired (detail prop-based) |
| Backup trigger/list/status | `POST /api/backups/trigger`, `GET /api/backups?...`, `GET /api/backups/status` | `backup.routes.ts` | `backupTriggerSchema`, `backupQuerySchema` | ✅ wired |
| Settings get/put + logo | `GET/PUT /api/settings`, `POST/DELETE /api/settings/logo`, `GET /api/assets/:id` (`AppHeader`, `BrandLogoSection`) | `settings.routes.ts`, `asset.routes.ts` | `systemSettingsSchema` | ✅ wired |
| Import / Export | `POST .../import/customers|grns` (FormData `file`), `GET .../export/grns|deliveries|inventory-ledger|customers|stock-summary` | `import-export.routes.ts` | `exportDateRangeQuerySchema`, `stockSummaryExportQuerySchema` | ✅ wired |
| Dashboard summary | `GET .../dashboard/summary` | `dashboard.routes.ts` | `dashboardSummarySchema` | ✅ wired |

No frontend call targets retired endpoints (`/api/storage/*`, `/api/chambers/*`, PUT customers). Dynamic `documents/${type}` constrained to `grn|receipt`; `import/${target}` constrained to `customers|grns`; `export/${endpoint}` callers pass only the 5 canonical types.

## 4. Headless REST API Endpoints (Retained & Fully Tested)

Per architecture governance, the endpoints below are intentionally retained as headless REST API capabilities (implemented, routed inline in `*routes.ts`, and covered by backend tests). Detail modals in the web UI reuse list entity props to avoid redundant network round-trips. Delivery reversal was headless until this branch wired `DeliveryReversalModal` into `deliveries/page.tsx`; there is no gate-pass endpoint (balances are ledger-derived).}

| # | Endpoint & Method | Handler / Module | Contract Schema | Capability / Purpose |
|---|---|---|---|---|
| 1 | `PATCH /api/facilities/:fid/grns/:gid` | `grn.routes.ts:176` (inline) | `correctGrnSchema` | GRN receipt quantity/weight post-creation administrative correction (frontend only calls `loan-status`) |
| 2 | `GET /api/grns/:grnId/acknowledgement` | `grn.routes.ts:129` (inline) | `grnParamsSchema` | Machine-readable JSON acknowledgement of inward receipt |
| 3 | `GET /api/facilities/:fid/grns/:gid/deliveries` | `delivery.routes.ts:180` (inline) | `grnParamsSchema` | Direct outward delivery history query for a specific GRN (bond-ledger uses `movement-history` instead) |
| 4 | `GET /api/facilities/:fid/inventory`, `/inventory/ledger`, `/inventory/customer/:cid`, `GET .../rent/occupancy-report` | `inventory.routes.ts`, `rent.routes.ts:120` (inline) | `stockLedgerQuerySchema` | Facility rollups retained API-only; UI reads `inventory-summary` + `movement-history` + `rent/grn/:id` |
| 5 | `GET /api/customers/:id` | `customer.routes.ts:59` (inline) | `customerParamsSchema` | Programmatic single-customer entity lookup (UI modals are prop-based by design) |
| 6 | `GET /api/commodities/:id` | `commodity.routes.ts:38` (inline) | `commodityParamsSchema` | Programmatic single-commodity entity lookup (UI modals are prop-based by design) |
| 7 | `GET /api/audit-logs/:id` | `audit.routes.ts:60` (inline) | `auditParamsSchema` | Forensic single audit log entry lookup by immutable ID (UI modal is prop-based by design) |


## 5. Fixed in this branch (no new features)

1. UI tokens: removed compact `.actionBtn` overrides (`grns/deliveries/page.module.css`) in favour of DS `Button size=sm`; replaced hardcoded `11px/10px` cell text with `var(--text-xs)`; replaced `gap:1/2/3px`, `margin/padding px` with `var(--space-*)`; removed hex fallbacks (`BondLoanSection`); fixed non-existent tokens (`--color-surface-3` → `--color-surface-2`, `--color-danger-border` → `--color-danger`, `--space-2-5` → `--space-2`, `letter-spacing:0.5px` → `var(--tracking-label)`); corrected fill-vs-text roles (`--color-primary/success/warning` → `*-text` for text).
2. Contracts: `useProvisionUserForm` mobile regex now delegates to `indianMobileSchema`; `deliveries/page.tsx` rent lookup now uses `requestWithAuth` (was bare `fetch` without refresh); `record-payment.handler` post-payment balance + audit status now derive from `computeRentBalance`; rent-receipt preview derives status from `computeRentBalance`; fixed stale `counter.service` comment.
3. Hygiene: deleted dead `bag-composition.ts` (zero importers; `ledger-polarity.ledgerBagQuantity` is canonical) and orphan `grn/queries/grn-movement-history.queries.ts` shim; removed dead `inventory.mappers isTransientError` re-export and dead `isDatabaseConnected`; uninstalled alien `cookie-parser` dep; wired orphan `DeliveryReversalModal` into `deliveries/page.tsx` (`delivery:reversal` gate); derived `useRentGate.rentBlocked` from SSOT summary (was constant `false`); fixed stale comments; fixed `e2e/ui-density` mocks to real `/api/facilities|audit-logs|backups|customers|commodities|users` paths and added `/bond-ledger`.
4. Line budget: extracted `DeliveryPageModals` so `deliveries/page.tsx` stays ≤250 lines.

## 6. Remaining tracked (progressive, not in this PR)

- Migrate remaining `.fieldInput` form copies to DS `Input` one route at a time (currently token-compliant; no new primitive needed).
- Consider `eslint-plugin-jsx-a11y` as lint enforcement; extend e2e beyond mocks (rent collect/print, reversal, ledger).
- Print template `renderPassbookHtml.ts` intentionally keeps standalone print CSS (hex/px) for print fidelity; excluded from screen-token rules. `StatCard` 1px hairline gap is intentional (border divider technique).

## 7. Verification

- `npm run type-check` ✅ · `npm run lint` ✅ · `npm run test` (contracts) ✅
- `bash scripts/check-architecture-boundaries.sh` ✅ · `bash scripts/check-line-budget.sh` ✅
- `npm run hygiene` ✅ · Manual: every button click-path in §3 traced to handler + endpoint; loading/disabled states preserved.
