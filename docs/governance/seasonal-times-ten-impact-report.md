# Seasonal ×10 Impact Report (Read-Only — No Mutations)

Branch: `feat/same-grn-seasonal-monthly-lifecycle`, Phase 7.
This report is diagnostic only. No GRN was repriced, no payment reversed, no
record backfilled. Any correction is a separately reviewed, idempotent, audited
operation — none is approved or included here.

## 1. What changed

Before this branch, `calculateRentAmount` computed Seasonal rent as
`bags × rate × 10` (`SEASONAL_RENT_MONTHS`). After Phase 1 it computes
`bags × rate` (whole-season total). Every consumer now flows through the
corrected SSOT; no parallel formula was introduced.

## 2. Which historical records may be affected

A Seasonal GRN created before this change whose `rentAmount` was derived from
agreed bag rates (rather than typed as a lump sum) stores roughly 10× the new
whole-season total. Candidates match either pattern (2dp tolerance):

```js
// Likely ×10-era derived obligation (informational middles excluded):
//   rentAmount ≈ bags × bagPrice × 10
//   rentAmount ≈ (smallBags × smallBagPrice + bigBags × bigBagPrice) × 10
db.grns.find({
  rentType: 'Seasonal',
  $expr: {
    $gt: [{ $abs: { $subtract: ['$rentAmount', { $multiply: ['$bags', { $ifNull: ['$bagPrice', 0] }, 10] }] } }, 0.02],
  },
});
```

Refine per GRN in application code (S+B split, null rates, lump-sum
`rentAmount` entries that never derived from rates must be excluded by hand):
only GRNs with positive agreed rates AND `rentAmount ≈ derived × 10` are
candidates. Lump-sum GRNs, Monthly GRNs, `rentAmount: 0` dynamic GRNs, and
closed/settled GRNs are out of scope for any future correction.

## 3. Why nothing was auto-corrected

- Stored `rentAmount` is the legal obligation paid against; `rentpayments`
  are append-only and immutable. Rewriting history would orphan receipts.
- The ×10-era and new-semantics values are indistinguishable from the amount
  alone when rates were typed as lump sums — automation would misfire.
- Finalized `rentextensions` rows record `calculatedAmount`/`finalAmount` at
  finalization time and stay valid as written.

## 4. Forward guarantees (verified by tests)

- New Seasonal GRNs store `bags × seasonal controller rate` (Phase 3 blocks
  submission without a configured rate; the server rejects mismatched rates).
- `resolveTotalDue = Grn.rentAmount + Σ extension.finalAmount`; each
  `(facility, GRN, seasonYear, period)` bills at most once (unique index +
  idempotent finalize + duplicate-key read-back).
- Balances stay `max(0, due − paid)`; overpayments are rejected; GRNs close
  only when stock and balance are both zero.

## 5. Cleanup verified in this phase

- Removed `calculateMonthlyCharge` (dead: zero non-test consumers; canonical
  per-period charges already flow through `calculateMonthlyOccupancy`).
- Kept `SEASONAL_RENT_MONTHS = 10` strictly as an informational display
  constant and stored `rentMonths` metadata; it no longer enters any formula.
- Kept backend `SEASONAL_MONTHS` test-fixture constant untouched (test scope
  only; renaming across suites adds churn without behavioral value).
- `RentExtension` + `CommodityRate` registered in monitored index declarations.
