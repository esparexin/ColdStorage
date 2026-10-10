# Commodity Price Controller Rates Modal — UI/UX & Pricing Integrity Audit (Phase 0)

Branch: `feat/same-grn-seasonal-monthly-lifecycle` (working tree clean at audit time).
Scope: read-only audit. No behavior changes in this phase. This refines the existing
Price Controller implementation; no new pricing system is created.

## 1. Modal UI audit (current vs required)

Source: `frontend/src/app/commodities/components/CommodityRatesModal.tsx` (116 lines),
`commodityRates.helper.ts`, `hooks/useCommodityRates.ts`, `commodities/page.module.css`.

| Requirement | Current state | Gap |
|---|---|---|
| Seasonal section (Mar–Dec) + Monthly section (Jan–Feb) | Four fields in one flat list; period context only inside long labels | **Missing** — add two visually distinct sections |
| Responsive 2-col bag sizes on desktop, 1-col mobile | Single column always; no grid CSS | **Missing** — add section grid + `@media (max-width: 640px)` collapse (repo pattern: `LoanSettlementFields.module.css`) |
| Explicit units, required indicators, accessible labels | Units in labels; `required` + `id`/`label` on canonical `Input` | OK — preserve verbatim |
| Save Rates + Cancel, no duplicate controls | Single submit + Cancel; one PUT per rentType via `saveRates` | OK — preserve; clarify copy that save writes the complete 4-rate config |
| Loading / validation / success / error feedback | Loading ✓, field+Banner validation ✓, Banner error ✓, **success ✗** (modal just closes) | **Missing** — add `success`-variant Banner confirmation (role=status) |
| Independent configurability per commodity | Four separate fields, always saved together as one config | OK — keep atomic save; grouped display satisfies "independently configurable" |
| Stale state on commodity switch | `hydrated` never resets: opening Rates for commodity B after A shows A's values until refetch, then keeps them (`useEffect` early-returns) | **Bug** — reset form/hydration when `commodity.id` changes |

Out of scope (verified present, untouched): `commodity:manage` gating on the Rates action,
canonical `Modal`/`Button`/`Input`/`Banner`/`FeedbackStates` primitives, token CSS only.

## 2. Pricing rules trace (verified against source)

- Seasonal: `(s × seasonalSmall) + (b × seasonalBig)`, months forced to 1
  (`contracts/pricing.ts:49-60` via `commodity-rate.ts:calculatePeriodRent`). The 10-month
  duration is informational (`grn-rent.ts`); repo-wide grep confirms no `×10` multiplier
  remains outside time/size arithmetic.
- Monthly: `((s × monthlySmall) + (b × monthlyBig)) × N`
  (`calculateRentAmount` Monthly branch; extensions use `rentMonths: 1`).
- Inward consumes controller rates read-only (`useCommodityRate` → auto-filled state →
  read-only spans in `CustomerAgreedRateSection`; submit blocked while unresolved;
  server rejects mismatches incl. `bagPrice`, derived-amount checks, fail-closed omission).
- Outward bills the stored immutable agreement and discards the client hint after SSOT
  recompute (`create-delivery.handler.ts:113-130`); later controller edits cannot reprice
  agreed GRNs (pinned by `delivery-stored-agreement.test.ts`).
- Extensions/occupancy/summaries flow through `calculatePeriodRent`, occupancy SSOTs, and
  `totalRentDue` + `computeRentBalance`; no parallel formulas (prior F1/F2 consolidated).
- History, payments, pending balances, CSV legacy path, and authorization are preserved
  by existing tests; canonical ₹10/₹15 fallback sunset remains explicitly out of scope.

## 3. Phase plan

| Phase | Scope | Acceptance | Commit |
|---|---|---|---|
| 0 | This audit. Zero behavior change | Findings traceable to `file:line`; hygiene passes | `docs: audit commodity rates modal and pricing rules` |
| 1 | Modal refinement: two sections, responsive 2-col grid, success feedback, commodity-switch reset, size `sm`→`md`, clarified save copy; helper tests for new behavior | Four rates grouped/configurable; loading/validation/success/error all reachable; no stale values; a11y labels intact | `feat(commodities): refine rates modal sections and feedback` |
| 2 | Integration fixes only for gaps the audit verifies against code; each deletion needs usage proof + replacement test | Inward read-only rates correct; seasonal/monthly rules hold; no duplicate logic; balances unchanged | `fix(pricing): align rate consumption with controller authority` |

Each phase passes type-check, lint, affected suites, builds, hygiene, and manual a11y review
before the next begins. No pushes, merges, rebases, or PRs without explicit approval.
