'use client';

import {
  SEASONAL_RENT_MONTHS,
  calculateExtensionRent,
  calculateRentAmount,
  totalRentDue,
} from '@cold-storage/contracts';

/**
 * Worked pricing examples for the read-only explainer.
 *
 * These values are DERIVED by calling the canonical contracts functions — they are
 * not a second implementation. If the business rules change, the displayed numbers
 * change with them. Balance display mirrors `computeRentBalance` (backend
 * `modules/common/rent-balance.ts`: remaining = max(0, totalDue − paid), status
 * derived, never stored) using plain subtraction for presentation only.
 */

function inr(value: number): string {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const seasonalBags = 100;
const seasonalBagRate = 12;
const seasonalOriginal = calculateRentAmount({
  rentType: 'Seasonal',
  bags: seasonalBags,
  bagPrice: seasonalBagRate,
});

const mixedOriginal = calculateRentAmount({
  rentType: 'Seasonal',
  bags: 100,
  bagType: 'S+B',
  smallBags: 60,
  bigBags: 40,
  smallBagPrice: 10,
  bigBagPrice: 15,
});

const januarySnapshotBags = 40;
const januaryRate = 12;
const januaryExtension = calculateExtensionRent(januarySnapshotBags, januaryRate);

const februaryExtension = 0;

const totalDueExample = totalRentDue(seasonalOriginal, [januaryExtension]);
const paidExample = 5000;
// Mirrors computeRentBalance clamping: negative balances are never surfaced as credit.
const remainingExample = Math.max(0, Number((totalDueExample - paidExample).toFixed(2)));

export const pricingExamples = {
  seasonalBags,
  seasonalBagRate,
  seasonalMonths: SEASONAL_RENT_MONTHS,
  seasonalOriginal,
  seasonalFormula: `${seasonalBags} bags × ${inr(seasonalBagRate)} × ${SEASONAL_RENT_MONTHS} months = ${inr(seasonalOriginal)}`,
  mixedOriginal,
  mixedFormula: `(60 small × ₹10 + 40 big × ₹15) × ${SEASONAL_RENT_MONTHS} months = ${inr(mixedOriginal)}`,
  januarySnapshotBags,
  januaryRate,
  januaryExtension,
  januaryFormula: `${januarySnapshotBags} bags remaining on Jan 01 × ${inr(januaryRate)} = ${inr(januaryExtension)} for January`,
  februaryExtension,
  totalDueExample,
  totalFormula: `${inr(seasonalOriginal)} original + ${inr(januaryExtension)} January extension = ${inr(totalDueExample)} total due`,
  paidExample,
  remainingExample,
  remainingFormula: `${inr(totalDueExample)} due − ${inr(paidExample)} paid = ${inr(remainingExample)} remaining`,
  inr,
};
