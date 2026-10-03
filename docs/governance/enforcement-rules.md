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
| 2 | Frontend domain isolation | `inventory` must not import `storage` internals |
| 3 | Competing UI primitives | feature CSS must not redefine modal/pagination/search primitives |
| 4 | Route contract drift | customer update must be `PATCH`, not `PUT` |
| 5 | Legacy directories | `packages/backend/src/tests` stays retired |
| 6 | Put-away contract | frontend must call `/allocations`, never `/put-away` |
| 7 | Occupancy facility scope | occupancy reads must include `:facilityId` |
| 8 | Type SSOT | no local `PositionOccupancyResponse`; import from contracts |
| 9 | Mongoose duplicate index | no field with both `index: true` and `schema.index()` |
| 11 | Native `<select>` | must use the `Select` primitive |
| 12 | Native `<button>` | must use the `Button` primitive in feature/layout/auth code |
| 13 | Design tokens | no raw hex/hsl colours outside the token sheet |
| 14 | DOM integrity | no duplicate element ids (breaks label/aria association) |
| 15 | Backend logging | no raw `console.*` anywhere in `backend/src`; `utils/logger.ts` is the only sanctioned entry point |
| 16 | Route decomposition | storage hierarchy routers stay split per entity; `hierarchy.routes.ts` stays retired |
| 17 | Print SSOT | document printing goes through `lib/print-document.printHtmlDocument()` |
| 18 | No blocking dialogs | `alert()` / `confirm()` are prohibited; surface errors via `FeedbackStates` or inline `role="alert"` |

## 4. `scripts/check-accessibility.sh` — accessibility

- Every `<input>`, `<select>` and `<textarea>` must have an accessible name, satisfied by
  `aria-label`, `aria-labelledby`, an `id` referenced by a `<label htmlFor=...>`, or an
  implicit wrapping `<label>`. `placeholder` and prop spreads are **not** accepted as labels.
- `components/ui/*` primitives are excluded from the static scan because they bind labels at
  runtime through `React.useId()` and a `label` prop.
- The `Modal` primitive must enforce `role="dialog"` and `aria-modal="true"`.

## 5. Tooling that is available but not yet gating

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