import { describe, expect, it } from 'vitest';
import { calculateRentAmount, totalRentDue } from '@cold-storage/contracts';
import { pricingExamples } from '../pricingExamples';

/**
 * Pins the read-only explainer to the canonical SSOT: every displayed number
 * must equal an independent recomputation, and the remaining balance must use
 * the same max(0, due − paid) clamp as computeRentBalance.
 */
describe('pricingExamples', () => {
  it('derives all figures from the canonical contracts SSOT', () => {
    const ex = pricingExamples;
    expect(ex.seasonalOriginal).toBe(
      calculateRentAmount({ rentType: 'Seasonal', bags: ex.seasonalBags, bagPrice: ex.seasonalBagRate }),
    );
    expect(ex.januaryExtension).toBe(ex.januarySnapshotBags * ex.januaryRate);
    expect(ex.totalDueExample).toBe(totalRentDue(ex.seasonalOriginal, [ex.januaryExtension]));
    expect(ex.remainingExample).toBe(Math.max(0, ex.totalDueExample - ex.paidExample));
  });

  it('keeps the worked example in a partially-paid, internally consistent state', () => {
    const ex = pricingExamples;
    expect(ex.paidExample).toBeGreaterThan(0);
    expect(ex.paidExample).toBeLessThan(ex.totalDueExample);
    expect(ex.remainingExample).toBe(ex.totalDueExample - ex.paidExample);
  });
});
