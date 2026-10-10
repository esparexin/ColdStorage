# Same-GRN Lifecycle — Phase 8 Verification & Merge Readiness

Branch: `feat/same-grn-seasonal-monthly-lifecycle` (from `origin/main` @ `0138c8a`).
50 files changed, +1879/−305. No dependency changes. No migrations with writes.

## 1. Gate results (all required checks)

| Gate | Result |
|---|---|
| Type-check (`tsc` all workspaces) | ✅ clean |
| Lint (`eslint --max-warnings=0`) | ✅ clean |
| Contracts tests | ✅ 13 files / 116 tests |
| Backend tests (local Mongo replica-set test DB) | ✅ 80 files / 537 tests |
| Frontend tests | ✅ 10 files / 111 tests |
| Production builds (contracts + backend + Next.js) | ✅ clean |
| Hygiene audit (line budget, UI SSOT, a11y) | ✅ PASS |
| DB safety guard + index declarations | ✅ pass (`RentExtension`, `CommodityRate` monitored) |
| Security dependency audit | ⚠️ 3 pre-existing postcss advisories (Next.js toolchain, on `main` too; no `package.json`/`lock` changes on this branch — left untouched) |

## 2. Acceptance criteria (all hold)

- `100 bags × ₹12 Seasonal = ₹1,200` whole season; `100 × ₹12 Monthly × 1 = ₹1,200`
  (`pricing.contracts.test.ts` `5b`, renewal + reconciliation suites).
- One GRN spans seasons: season 1 on `Grn.rentAmount`, renewals + Jan/Feb as
  idempotent `rentextensions` rows; retry returns the existing row; earlier
  seasons and origin-season `SEASON` are rejected (`rent-renewal` suite).
- Pending reconciles: `totalDue − paid` across all periods; partials carry
  forward; overpayments rejected; history immutable; GRN closes only with zero
  stock and zero balance (`rent-reconciliation` + settlement suites).
- Controller authority: reads scoped to `commodity:view`, writes to
  `commodity:manage`; mismatched submissions → 400; unconfigured commodities
  keep the legacy path; history never repriced (`commodity-rate`,
  `grn-rate-enforcement` suites).

## 3. Deferred to the merge gate (with reason)

- Playwright e2e: no browsers installed locally; specs are route-mocked and
  cover none of the changed pricing/rent flows. Runs in CI (`playwright.yml`).
- Manual UI/UX + accessibility pass: production build prerenders cleanly,
  hygiene a11y gates pass, and all new UI reuses canonical primitives with
  labelled controls and loading/error/empty states; a human click-through of
  Inward → renewal → collect → history → receipt is still required before merge.
- ×10-era historical obligations: intentionally untouched (see
  `seasonal-times-ten-impact-report.md`); any correction needs a separate
  reviewed, idempotent, audited operation.

## 4. Merge checklist

1. CI green on this branch (type-check, lint, tests, build, hygiene, e2e).
2. Human verification of the deferred items above, recorded on the PR.
3. Squash or rebase per repository governance; delete the branch after merge.
4. Seed Price Controller rates per commodity before operators use Inward
   (unconfigured pairs block submission by design).
