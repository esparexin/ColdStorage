# UI ↔ Backend Wiring Matrix (SSOT)

> Branch: `chore/ui-ux-backend-wiring-audit` · Date: 2026-10-03
> Rule: every interactive element must map to a real backend route + contract schema.
> No frontend-only actions. Prop-based detail modals are intentional (no new single-GET fetches).

## 1. Frontend inventory

- Framework: Next.js 14 App Router, `src/app/*/page.tsx`, `next.config.mjs` rewrites `/api/:path*` → backend `:4000/api/:path*`.
- Routes (13): `/`, `/grns`, `/inventory?grnId=`, `/deliveries`, `/rent`, `/customers`, `/commodities`, `/storage`, `/settings`, `/import-export`, `/audit`, `/backup`, `/users`.
- Primitives (`components/ui/index.ts`, 10): `Button`, `Input`, `Select`, `Badge`, `Card`, `SearchBar`, `Modal`, `Pagination`, `DataTable`, `FeedbackStates`.
- Client: `lib/api-client.ts` (`requestWithAuth` + single-flight `POST /api/auth/refresh`, Bearer memory-only, `credentials:include`).
- Contexts: `AuthContext` (login/logout/change-password), `FacilityContext` (`GET /api/facilities`), `SettingsContext` (`GET /api/settings`).

## 2. Design-system adoption (verified)

| Primitive | Status | Evidence |
|---|---|---|
| `Button` | ✅ widely used (56 `<Button` hits) | `grns/page.tsx:72`, `deliveries/*`, `rent/*`, `users/page.tsx:63` |
| `Input` | ⚠️ partial (7 hits, only 3 modals) | `CustomerFormModal:135`, `CommodityFormModal:67`, `FacilityModal:94` |
| `Select` | ❌ 0 imports outside `ui/` | 23 native `<select>` bypass DS (toolbars, `AppHeader:63`, `ProvisionUserModal:106`) |
| `Card` | ❌ 0 `<Card` usages | Replaced by `KpiGrid`/`RentKpiCards`/`BackupStatusCards`/`StorageItemCard` |
| `SearchBar` | ✅ 6 toolbars | `UserFilterBar:31`, `GrnFilterToolbar`, etc. |
| `Modal/DataTable/Badge/Pagination/FeedbackStates` | ✅ consistent | 16 modals via `Modal`, 12 tables via `DataTable`, status via `Badge` |

## 3. Route ↔ API wiring (all verified against `backend/src/routes/*.ts` + `contracts/src/*.ts`)

| UI action | Frontend call | Backend route | Contract | Verdict |
|---|---|---|---|---|
| Login / logout / change-password / bootstrap | `POST /api/auth/login`, `requestWithAuth(/api/auth/logout)`, `(/api/auth/change-password)`, `POST /api/auth/refresh` | `auth.routes.ts` | `loginInputSchema`, `changePasswordInputSchema` | ✅ wired |
| Facility switch / list / create / patch | `GET /api/facilities`, `POST /api/facilities`, `PATCH /api/facilities/:id` (`FacilityModal:51`) | `facility.routes.ts` | `createFacilitySchema`, `updateFacilitySchema` | ✅ wired |
| Storage drill (chamber→rack→level→position) | `GET .../chambers`, `GET /api/chambers/:id/racks`, `GET /api/racks/:id/levels`, `GET /api/levels/:id/positions`, `PATCH .../:id` deactivate | `hierarchy.routes.ts` | `create/update*Schema` | ✅ wired (list+patch; single-GETs intentionally unused) |
| Customers list/create/patch | `GET /api/customers?facilityId=`, `POST /api/customers`, `PATCH /api/customers/:id` (`CustomerFormModal:77`) | `customer.routes.ts` | `createCustomerSchema`, `updateCustomerSchema` (PATCH, not PUT) | ✅ wired |
| Commodities list/create/patch | `GET /api/commodities`, `POST/PATCH /api/commodities[/:id]` | `commodity.routes.ts` | `create/updateCommoditySchema` | ✅ wired |
| GRNs list/create/print/put-away link | `GET .../grns?...`, `POST .../grns`, `GET .../documents/grn|receipt/:id` (`grns/page.tsx:36`), `Link /inventory?grnId=` | `grn.routes.ts`, `document.routes.ts` | `createGrnSchema`, `grnQuerySchema`, `documentFormatQuerySchema` | ✅ wired; fixed `Link>Button` nesting + missing `linkButton` class |
| Put-away allocate / summary / occupancy / ledger | `POST .../grns/:gid/allocations`, `GET .../allocations`, `GET .../inventory-summary`, `GET .../positions/:pid/occupancy`, `GET .../inventory`, `GET .../inventory/ledger` | `inventory.routes.ts` | `createPutAwaySchema`, `stockLedgerQuerySchema` | ✅ wired (`/allocations` canonical, facility-scoped) |
| Deliveries list/create/detail/reverse/print | `GET .../deliveries?...`, `POST .../deliveries`, `POST .../deliveries/:id/reverse`, `GET .../documents/challan/:id` | `delivery.routes.ts` | `createDeliverySchema`, `reverseDeliverySchema`, `deliveryQuerySchema` | ✅ wired (detail modal prop-based by design) |
| Rent collect/history/print-preview/print | `POST .../rent/collect`, `GET .../rent/grn/:id`, `GET .../documents/rent-receipt/preview`, `GET .../rent/receipts/:n/print` | `rent.routes.ts`, `document.routes.ts` | `recordRentPaymentInputSchema` | ✅ wired |
| Users provision/list | `GET /api/users?page&limit`, `POST /api/users` (`useUsersData:23`, `useProvisionUserForm:57`) | `user.routes.ts` (SUPER_ADMIN only) | `createUserSchema`, `paginationSchema` | ✅ wired |
| Audit list | `GET /api/audit-logs?...` (`useAuditLogs:34`) | `audit.routes.ts` | `auditQuerySchema` | ✅ wired (detail prop-based) |
| Backup trigger/list/status | `POST /api/backups/trigger`, `GET /api/backups?...`, `GET /api/backups/status` | `backup.routes.ts` | `backupTriggerSchema`, `backupQuerySchema` | ✅ wired |
| Settings get/put + logo | `GET/PUT /api/settings`, `POST/DELETE /api/settings/logo`, `GET /api/assets/:id` (`AppHeader`, `BrandLogoSection`) | `settings.routes.ts`, `asset.routes.ts` | `systemSettingsSchema` | ✅ wired |
| Import / Export | `POST .../import/customers|grns` (FormData `file`), `GET .../export/grns|deliveries|inventory-ledger|customers|stock-summary` | `import-export.routes.ts` | `exportDateRangeQuerySchema`, `stockSummaryExportQuerySchema` | ✅ wired; `ExportPanel` now uses DS `Button` |
| Dashboard summary | `GET .../dashboard/summary` | `dashboard.routes.ts` | `dashboardSummarySchema` | ✅ wired |

No frontend call targets a non-existent backend prefix (`/api/storage/*`, `/api/inventory/*`, PUT customers, `/put-away`). Dynamic `documents/${type}` constrained to `grn|receipt`; `import/${target}` constrained to `customers|grns`; `export/${endpoint}` callers pass only the 5 canonical types.

## 4. Backend-only (intentional, no UI added per scope)

`GET /api/auth/me`, `GET /api/users/:id`, `GET /api/facilities/:id` single, `GET /api/chambers|racks|levels|positions/:id` singles, `GET /api/customers|commodities/:id` singles, `GET /api/grns/:grnId` + `/acknowledgement`, `GET .../grns/:gid/deliveries`, `GET .../deliveries/:deliveryId` single, `GET /api/audit-logs/:id`. Detail modals reuse list props to avoid extra round-trips. Add a fetch only if a stale-data bug is proven.

## 5. Fixed in this branch (no new features)

1. `inventory/page.tsx:30` dead ternary `initialGrnId ? 'put-away' : 'put-away'` → always `'put-away'`.
2. `GrnDetailModal.tsx:58` invalid `Link > Button` nesting → `Link` styled as button (`linkButton` class added to `grns/page.module.css` without growing baseline).
3. `users/page.module.css`: added missing `.spinning` (referenced in `page.tsx:68`), tokenized raw `hsl()` badge values to `var(--color-*)`, removed legacy dead classes (`.primaryBtn`, `.refreshBtn`, `.searchBox`, `.modalOverlay`, `.modalContent`, `.modalHeader`, `.closeBtn`, `.cancelBtn`, `.badge*`) now covered by DS `Button`/`Modal`/`Badge`.
4. `InventoryHeader.tsx`: tabs now `role="tablist"/role="tab" aria-selected` (was plain buttons).
5. `UserFilterBar.tsx`: native role `<select>` migrated to DS `Select` (first exemplar; 22 remaining tracked, not all migrated to keep PR <500 lines).
6. `ExportPanel.tsx`: 5 native export `<button>`s migrated to DS `Button` (`secondary/sm`, `isLoading`), removed inline `style` for unauthorized note (now `.mutedNote` token class).

## 6. Remaining tracked (not in this PR to avoid size/duplication)

- Migrate remaining 22 native `<select>`s and tab/combobox/icon `<button>`s to `Select`/`Button` one route at a time.
- Unify 3 KPI card systems and 5 filter toolbars into single canonical components.
- Add `loading.tsx`/`error.tsx` only if App Router gaps proven; add `eslint-plugin-jsx-a11y` as lint enforcement.
- Extend `e2e/critical-flows.spec.ts` beyond mocks (rent collect/print, reversal, put-away→ledger).

## 7. Verification

- `npm run type-check` ✅ · `npm run lint` ✅ · `npm run test` (contracts+backend) ✅
- `bash scripts/check-architecture-boundaries.sh` ✅ · `bash scripts/check-line-budget.sh` ✅ (CSS lines only decreased)
- Manual: every button click-path in §3 traced to handler + endpoint; loading/disabled states preserved.
