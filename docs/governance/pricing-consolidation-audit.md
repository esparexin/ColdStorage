# Bag Pricing & Rent Calculation — Consolidation Audit (Phase 0)

Branch: `feat/same-grn-seasonal-monthly-lifecycle` (9 commits ahead of `origin/main`, working tree clean at audit time).
Scope: read-only audit + locked rules. No production behavior changes in this phase.

Pre-Phase-0 verification (all matched, no drift — abort criteria not triggered):
- Active branch `feat/same-grn-seasonal-monthly-lifecycle`; `git status` clean.
- Price Controller APIs present: `commodity-rate.ts` contracts (schemas + `pickRateForBags` + `calculatePeriodRent`), `commodity-rate.model.ts`, `commodity-rate.service.ts`, `GET`/`PUT /api/commodities/:commodityId/rates`.
- Rate-validation call sites present: `create-grn.handler.ts:61`, `update-grn.handler.ts:139`, `rent-extension.service.ts:101`.
- F1 duplicate confirmed at `rent-extension.repository.ts:86-92`; F2 effective-rate division at `rent-extension.service.ts:121`.
- `resolveAuthoritativeRate` prod-dead (definition + own tests only).
- Settings shell gated by `settings:manage`; Commodities page by `commodity:manage`; no frontend rate inputs exist.

## 1. Verified findings

### Canonical path (keep — one calculation path already exists)
All bag-rate math routes through the contracts SSOT and every consumer calls it:
`calculateRentAmount` / `deriveBagPrice` / `resolveOutwardRates` (`contracts/pricing.ts`),
`calculateSeasonalOccupancy` (`contracts/rent.ts`),
`calculateExtensionRent` / `totalRentDue` (`contracts/rent-extension.ts`),
`calculatePeriodRent` / `pickRateForBags` (`contracts/commodity-rate.ts`),
`computeRentBalance` (`backend/modules/common/rent-balance.ts`).
Backend handlers (delivery, GRN edit, extension service, summary, payment) and
frontend (`deliveryRent.helper`, `useCreateDeliveryForm`, `pricingExamples`) delegate.
No `bags*price` or `rent/bags` exists outside contracts except F2 below.

### Defects to fix
- **F1 — duplicate `totalRentDue`** (`rent-extension.repository.ts:86-92`): `resolveTotalDue`
  re-implements `original + Σ extensions` inline instead of calling `totalRentDue()`.
  Same result today; bypasses the SSOT rounding path. Consumers: payment, rent gate, merge, transfer.
- **F2 — unsanctioned split-rate division** (`rent-extension.service.ts:121`):
  weighted-average `charge/total` `bagRate` for S+B splits lives outside contracts;
  `deriveBagPrice` has no split branch. Promote into `commodity-rate.ts`.
- **F3 — admitted mirror** (`pricingExamples.ts:51` mirrors `computeRentBalance` clamping
  for display; frontend cannot import the backend helper). Benign — pin with a sync test.
- **No admin rates UI exists.** `PUT /api/commodities/:id/rates` has zero frontend callers;
  `CommodityFormModal` is name + `isActive` only; the Settings pricing tab is a read-only
  explainer (no inputs/state/API).
- **`resolveAuthoritativeRate` is dead in prod** (own tests only). Removal candidate for Phase 6
  after re-verification.
- **Outward correctly does NOT live-fetch the controller**: it bills the stored immutable
  agreement with canonical fallback and discards the client hint after recompute
  (`create-delivery.handler.ts:113-130`). This division (Inward agrees at controller rates;
  Outward executes the agreement) is by design and must be preserved.

### Bypass list (client-controlled values reaching storage unchecked)
- **B1:** `bagPrice` never validated on create (`create-grn.handler.ts:61-64,156`), yet overrides
  canonical outward via `resolveOutwardRates`.
- **B2/B6:** `rentAmount` stored verbatim on create (`:84-85`) and correction
  (`grn-edit-rent.ts:82-83`), bypassing rate-derived obligation.
- **B3/B4:** unconfigured commodity → any schema-valid rates stored; configured commodity +
  omitted rates → vacuous pass (`commodity-rate.service.ts:112-114`), storing `null`.
- **B5:** PATCH gate omits `bagPrice`/`rentAmount`/`rentMonths` (`update-grn.handler.ts:131-136`);
  single-field rate edits skip validation yet feed `calculateRentAmount`.
- **B7:** commodity/rentType switch without resubmitted rates carries stale stored rates silently;
  commodity-only changes skip `resolveRentEdit` entirely.
- **B8:** CSV import (no rate columns by design) stores CSV `rentAmount` + null rates unchecked.

### Load-bearing constraint
`rentAmount` is legitimate standalone input for dynamic-monthly (`0`) and lump-sum/historical
obligations including CSV rows. Enforcement rule: **when agreed rates are known and a
controller row exists, `rentAmount` must equal the SSOT-derived amount**; otherwise legacy applies.

## 2. Locked business rules

1. **Branch base:** work continues from `feat/same-grn-seasonal-monthly-lifecycle`. No merge,
   rebase onto `main`, push, or PR without explicit approval.
2. **Manually supplied `rentAmount`:** derive-and-reject when a controller row, quantities, and
   type are known. Preserve `0`/dynamic, historical, imported, and approved standalone
   obligations; never silently overwrite or reprice them.
3. **Missing rates:** fail closed for new/corrected records when the commodity is configured
   but the required rate is missing. Preserve legacy records and supported imports. CSV behavior
   changes require an approved compatibility policy first — Phase 5 proposes, never imposes.
4. **`resolveAuthoritativeRate`:** remove only after re-verified-dead with no external consumers
   and no required-contract status; retriage its tests (keep equivalent canonical coverage).
5. **Canonical fallback (Small ₹10 / Big ₹15): NOT locked.** Fail-closed for configured
   commodities (rule 3) already neutralizes masking on new records. Full sunset needs separate
   approval and is out of scope; historical calculations and legacy workflows are preserved.

## 3. Standing constraints

- Seasonal `bags × seasonal rate` (10-month Mar–Dec informational, never a multiplier);
  monthly rate × billing duration.
- One canonical calculation path in `packages/contracts`; no duplicated formulas.
- Rates management UI lives on the Commodities page under `commodity:manage` (ADMIN+);
  never under the `settings:manage`-restricted Settings shell.
- Outward keeps stored-agreement behavior; no live reprice of existing GRNs.
- Immutable payments, historical rent, outstanding balances, CSV compatibility preserved.
- No dummy logic, unnecessary abstractions, duplicate formulas, or unverified deletions.

## 4. Scope boundaries (explicit non-goals)

- No sunset of the canonical fallback; no repricing of historical GRNs; no payment mutations.
- No CSV behavior change without an approved compatibility policy.
- No Outward live-controller fetching.
- No rebase/merge/push/PR without explicit approval.

## 5. Phase sequence, acceptance criteria, commits

| Phase | Scope | Acceptance | Commit |
|---|---|---|---|
| 0 | This audit + locked rules. Zero behavior change | Findings traceable to `file:line`; hygiene passes | `docs: audit bag pricing paths and controller gaps` |
| 1 | F1 delegates to `totalRentDue`; F2 promoted beside `calculatePeriodRent`; F3 pinned | 537 backend + 116 contracts tests green, byte-identical outputs | `refactor(pricing): consolidate rent calculations into contracts` |
| 2 | Commodities-page Rates editor modal + hook + PUT wiring + 403 tests; canonical UI, 250-line budget, labeled controls | ADMIN manages rates end-to-end; no rate inputs elsewhere | `feat(commodities): manage price controller rates from admin dashboard` |
| 3 | B1 `bagPrice` coverage; B2 derived-amount invariant (preserving `0`/legacy); B4 fail-closed on omission | Bypass tests red→green; fixtures/history untouched | `fix(pricing): enforce controller authority on inward create` |
| 4 | Widen PATCH gate (B5); commodity/switch re-resolution (B7) | Tamper/switch tests rejected with 400 | `fix(pricing): enforce controller authority on inward correction` |
| 5 | CSV verify-and-propose only (B8, no code change); pin Outward agreement semantics with tests; document responsibilities | Import suite green unmodified; outward suite green | `fix(pricing): govern import rates and preserve outward agreements` |
| 6 | Re-verify + remove dead code only; wiring matrix/docs/fixtures; full gates; stop at merge readiness | One definition per formula; zero orphaned pricing files; all gates green | `test(pricing): verify consolidated pricing integrity` |

Each phase passes type-check, lint, affected suites, and hygiene before the next begins.

## 6. Phase 5 proposal — CSV compatibility policy (requires approval, NOT implemented)

Verified current behavior (pinned by `grn-import-legacy.test.ts`): the CSV carries no
rate columns by design; `executeGrnImport` calls `createGrn` with an explicit legacy
opt-out, so rentAmount-only rows commit even when a controller row exists. Outward
bills such rows at canonical fallback; extensions derive from the stored lump sum.

Proposed policy (no code changes until approved): when an active controller row exists
for the row's (commodity, rentType), reject rate-less rows with a message directing
operators to record agreed rates through the Inward UI (or a future optional
`smallBagPrice`/`bigBagPrice` column set, which would then validate exactly like
interactive submissions). When unconfigured, accept exactly as today. In all cases:
no retroactive invalidation of already-imported rows, no silent repricing, dynamic
and lump-sum semantics preserved.

Outward division of responsibilities (pinned by `delivery-stored-agreement.test.ts`):
delivery bills the stored immutable agreement and never live-fetches the controller;
later controller edits must not reprice agreed GRNs. Canonical fallback stays for
unconfigured/legacy records only (full sunset out of scope per rule 5).
