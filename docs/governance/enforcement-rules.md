# Governance Rule Inventory

This file records what each automated gate actually enforces, so the documented governance
matches the enforced governance. Every rule below runs as part of `npm run hygiene`, which is
invoked by the pre-commit hook and by the `ColdStorage CI` and `Governance Validation`
workflows.

## 1. `scripts/hygiene-audit.sh` — repository hygiene

| # | Rule | Detects |
|---|---|---|
| 1 | Legacy filename patterns | `*final2*`, `*old-*`, `*-old.*`, `*copy-*`, `*bak-*` |
| 2 | Placeholder / leftover-work markers | `dummy`, `placeholder production logic`, `lorem ipsum`, `final2`, `TODO`, `FIXME`, `XXX`, `HACK:`, `coming soon`, `not implemented` — scanned across `.ts`, `.tsx`, `.mjs` |
| 2b | Debugger statements | `debugger;` in any package source |
| 3 | Build artefacts in git | tracked `dist/` or `coverage/` |
| 3b | Test leakage in build outputs | compiled `dist/__tests__` in package distributions |
| 4 | Local env files in git | `.env`, `.env.local`, `.env.*.local` at any depth |
| 5 | Line budget & ratchet | delegates to `check-line-budget.sh` |
| 6 | Architecture boundaries & UI SSOT | delegates to `check-architecture-boundaries.sh` |
| 7 | Accessibility | delegates to `check-accessibility.sh` |

## 2. `scripts/check-line-budget.sh` — file size

- Hard maximum **250 lines** for any `.ts`, `.tsx` or `.css` file under `packages/*/src/`.
- Ratchet: a file listed in `scripts/line-budget-baseline.json` may never grow.
- Graduation: once a baseline file drops to 250 lines or fewer its entry should be removed.

## 3. `scripts/check-architecture-boundaries.sh` — boundaries & SSOT

| # | Rule | Enforces |
|---|---|---|
| 1 | Backend cross-domain imports | `delivery`/`rent` must not import `grn` internals |
| 2 | Storage-hierarchy retirement | chamber/rack/level/position route files, models and the `/storage` feature module must not be reintroduced |
| 3 | Competing UI primitives | feature CSS must not redefine modal/pagination/search primitives |
| 4 | Route contract drift | customer update must be `PATCH`, not `PUT` |
| 5 | Legacy directories | `packages/backend/src/tests` stays retired |
| 6 | Put-away contract | frontend must call `/allocations`, never `/put-away` |
| 7 | Free-text chamber | `capacityBags` / `occupiedBags` / `availableBags` / `utilizationRate` / `positionOccupancy` must not reappear in contracts or backend source (tests excluded: they assert rejection) |
| 8 | Type SSOT | `positionId`, `positionCode`, `rackId`, `levelId`, `chamberId`, `chamberNumber` must not reappear in `@cold-storage/contracts` |
| 9 | Mongoose duplicate index | no field with both `index: true` and `schema.index()` |
| 11 | Native `<select>` | must use the `Select` primitive |
| 12 | Native `<button>` | must use the `Button` primitive in feature/layout/auth code |
| 13 | Design tokens | no raw hex/hsl colours outside the token sheet |
| 14 | DOM integrity | no duplicate element ids (breaks label/aria association) |
| 15 | Backend logging | no raw `console.*` anywhere in `backend/src`; `utils/logger.ts` is the only sanctioned entry point |
| 16 | Print SSOT | document printing goes through `lib/print-document.printHtmlDocument()` (no direct `window.open` in feature code) |
| 17 | (retired number — print SSOT is Rule 16; kept vacant so script numbering stays stable) |
| 18 | No blocking dialogs | `alert()` / `confirm()` are prohibited; surface errors via `FeedbackStates` or inline `role="alert"` |
| 19 | Bag composition SSOT | no stored `quantity`/`totalBags` beside `smallBags`+`bigBags`; totals are derived at read time |
| 20 | Balance-snapshot SSOT | no stored `openingBags`/`closingBags` snapshots; balances are ledger-derived |
| 21 | Ledger self-sufficiency | `create-grn.handler.ts` must write the `INWARD_PUTAWAY` row in the same transaction as the receipt |
| 22 | Single balance formula | no `hasLedgerTxns` source switch; balances come from the ledger for every facility |
| 23 | GR Number business-key SSOT | `grnNumber` is the sole business key: `inwardReceiptNumber`/`bondNumber` may not appear in a GRN search clause (`$or`/regex), and no BND- number may be minted per receipt (`generateBondNumber` is gone) |
| 24 | Compact action overrides | no `.actionBtn` competing override of DS `Button size=sm` in feature CSS |
| 25 | Token typography/spacing | no hardcoded `font-size:11px/10px`, `gap/margin/padding px`, hex fallbacks, `!important` compact overrides, or non-existent tokens (`surface-3`, `danger-border`, `space-2-5`) in screen UI; fill-vs-text roles (`*-text` for text) must be respected. Print template `renderPassbookHtml.ts` and the intentional `StatCard` 1px hairline are the only sanctioned exceptions |
| 26 | Undefined design tokens | no references to non-existent tokens: `--text-md` (use `--text-base`), unindexed `--color-surface` (use `--color-surface-1` or `-2`), `--color-border-subtle` (use `--color-border`), and `--color-surface-hover` (use `--color-surface-2`) |
| 27 | Single bordered surface SSOT | `DataTable` provides its own bordered container; wrapping `DataTable` inside `Card` is prohibited to prevent double-border defects |
| 28 | Screen table SSOT | interactive screen tables must consume the canonical `DataTable` primitive; raw `<table>` implementations in feature screens are strictly prohibited (zero baseline exceptions) |
| 29 | Shared button primitive SSOT | UI primitives and feature feedback states must consume the canonical `Button` primitive rather than raw `<button>` elements |
| 30 | Document Print Paper Size SSOT | All document templates and print stylesheets must conform exclusively to A6 dimensions (105 × 148 mm in portrait or landscape); unintended A4, A5, or Letter page sizes are strictly prohibited |

## 4. Responsive Viewport Verification Matrix

All frontend screens and shared layouts are verified against zero horizontal overflow, zero control overlap, and complete touch/keyboard accessibility across the canonical viewport matrix:

| Width | Category | Representative Devices | Zero-Overlap Verification Criteria |
|---|---|---|---|
| **320px** | Narrow Mobile | iPhone SE (1st gen), small Androids | Shell collapses to mobile drawer; headers and filters wrap; no document horizontal overflow |
| **360px** | Standard Mobile | Galaxy S-series, standard Androids | Tables scroll within container only; action buttons remain accessible (min 32px touch target) |
| **375px** | Compact Mobile | iPhone SE (2nd/3rd gen), iPhone 8/X | Global search accessible via mobile trigger modal; forms stack without input horizontal spill |
| **390px** | Modern Mobile | iPhone 12 / 13 / 14 / 15 | Touch targets meet minimum 44px for primary actions; modals fit within viewport |
| **430px** | Large Mobile | iPhone Pro Max, Galaxy Ultra | Clean single-column form stacking; sticky headers stay within viewport bounds |
| **768px** | Tablet Portrait | iPad Mini, standard 768p tablets | Collapsed/compact sidebar drawer; multi-column forms adapt to 2/3 columns; tables fit |
| **820px** | Tablet Mid | iPad Air (10.9-inch) | Transition breakpoint: drawer collapses cleanly; content recalculates available width |
| **1024px** | Tablet Landscape / Desktop | iPad Pro 11-inch, small laptops | Permanent 216px sidebar; full filter toolbar in-line; all table columns visible or scrollable |
| **1280px** | Standard Desktop | 13-inch MacBooks, 720p monitors | Full-width data layouts without arbitrary horizontal measure caps; body text at 14px/1.5lh |
| **1440px** | Wide Desktop | 14/16-inch MacBooks, 1080p monitors | Page root claims full width between sidebar (216px) and shell gutters; inward form fits |
| **1920px** | Full HD Desktop | 1080p monitors, 4K at 200% scaling | Data screens claim full width with zero empty gutters; modals centered and focus-trapped |

## 5. `scripts/check-accessibility.sh` — accessibility

- Every `<input>`, `<select>` and `<textarea>` must have an accessible name, satisfied by
  `aria-label`, `aria-labelledby`, an `id` referenced by a `<label htmlFor=...>`, or an
  implicit wrapping `<label>`. `placeholder` and prop spreads are **not** accepted as labels.
- `components/ui/*` primitives are excluded from the static scan because they bind labels at
  runtime through `React.useId()` and a `label` prop.
- The `Modal` primitive must enforce `role="dialog"` and `aria-modal="true"`.

## 5. `scripts/check-backend-ssot.sh` — backend SSOT (R8, permanent)

| # | Rule | Enforces |
|---|---|---|
| F01 | Refresh replay guard | `auth.service.ts` must check `rotateSession` null + `REFRESH_TOKEN_REUSE_OR_RACE` |
| F02 | Session TTL | `session.model.ts` TTL + `{refreshTokenHash,revokedAt}` compound |
| F03 | Ledger idempotency | `inventory-transaction` unique `{referenceId,transactionType}` |
| F19 | Index monitoring | `Group` + `InternalMovement` in `MONITORED_MODELS` |
| F07 | Bill alias | `billNumber` alias documented in `grn.mappers.ts` |
| F05 | Limiter keying | `generalRateLimiter` IP-only, no `req.user` |
| F21 | Preview fixtures | `PREVIEW-RRCPT` only in `document.service.ts` (+ tests) |
| F24 | One-off scripts | `F24` legacy marker in both `scripts/` one-offs |

## 6. `scripts/check-backend-cycles.sh` — backend cycles (R8, permanent)

| # | Rule | Enforces |
|---|---|---|
| F09 | No `auth<->users` static cycle | `user.service.ts` lazy session import only |
| F10 | No `rent<->delivery` static cycle | `record-payment` ledger-direct; `delivery.queries` lazy batched rent |
| F22 | Async boundary | `utils/async-handler.ts` exists + dashboard pilot adopted |
| — | GRN boundary | `delivery`/`rent` must not import `grn` internals |
| — | Frontend preservation | no `packages/frontend/` diff on backend branch |

Wired into `scripts/hygiene-audit.sh` step 8 and `.github/workflows/backend-governance.yml`. Bypass requires `governance-bypass` label + written approval + 7-day follow-up (see `backend-audit-governance.md`).

## 7. `scripts/check-backup-coverage.sh` + `check-db-connection-governance.sh` (permanent)

- Backup coverage (BKP-04): every business model file maps to `BACKUP_COLLECTOR_KEYS`; `backupType` enum in sync (contracts + mongoose). Approved exclusions: `Session` (ephemeral), `BackupLog` (recursive), `Role` (seed-managed).
- DB connections (DB-01): no bare single-arg `mongoose.connect()` in `backend/src`; no raw `MongoClient` in `backend/src`; `assertSafeDatabaseTarget` in connection helper; DBA scripts use `connectToDatabase`.
- Wired into `hygiene-audit.sh` steps 9–10. Exceptions in `exception-approvals.md` with owner/rationale/expiry.

## 8. Tooling that is available but not yet gating

- **Prettier** is configured in `.prettierrc` and installed, but there is no `format` script
  and it is not wired into CI. The repository has never been Prettier-formatted (174 files
  differ), so enforcing it now would bury any functional change in unrelated churn. This
  needs a dedicated formatting-only change first: run `npx prettier --write` across the tree,
  then add a `format:check` script and a CI step.

## 6. Known pre-existing alerts (not regressions)

- `js/missing-rate-limiting` fires on every Express router in `packages/backend/src/routes`.
  It is a false positive here: `app.use('/api', generalRateLimiter)` in `app.ts` applies a
  limiter to all `/api` routes, with `auth.routes.ts` additionally using `authRateLimiter`.
  There are 25 such open alerts on the default branch. Splitting the storage hierarchy router
  re-expressed the same already-alerted code under new filenames, which is why the PR-scoped
  CodeQL check reports them as "new". The correct fix is a CodeQL suppression config or
  query configuration, not restructuring working code.