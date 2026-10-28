import { describe, expect, it } from 'vitest';
import {
  bagTypeSchema,
  canCalculateAuthoritativeRent,
  formatDisplayBagType,
  isBagCompositionVerified,
  resolveMergedBagType,
} from '../index.js';
import { calculateRentAmount } from '../pricing.js';

describe('Contracts: BagType Hybrid SSOT Integration', () => {
  it('parses Hybrid as a valid canonical BagType', () => {
    const parsed = bagTypeSchema.parse('Hybrid');
    expect(parsed).toBe('Hybrid');
  });

  it('marks unconfirmed Hybrid lots as unverified and confirmed splits as verified', () => {
    expect(isBagCompositionVerified({ bagType: 'Hybrid', bags: 100 })).toBe(false);
    expect(isBagCompositionVerified({ bagType: 'Hybrid', bags: 50, smallBags: 30, bigBags: 20 })).toBe(true);
  });

  it('allows authoritative rent calculation for Hybrid with positive flat rate', () => {
    const canCalc = canCalculateAuthoritativeRent({
      bagType: 'Hybrid',
      bags: 100,
      bagPrice: 15,
    });
    expect(canCalc.canCalculate).toBe(true);

    const noRate = canCalculateAuthoritativeRent({
      bagType: 'Hybrid',
      bags: 100,
      bagPrice: 0,
    });
    expect(noRate.canCalculate).toBe(false);
  });

  it('calculates rent for bagType Hybrid using single flat rate without requiring bag split', () => {
    const rent = calculateRentAmount({
      rentType: 'Seasonal',
      bags: 100,
      bagType: 'Hybrid',
      bagPrice: 14,
    });
    expect(rent).toBe(1400);

    const monthlyRent = calculateRentAmount({
      rentType: 'Monthly',
      bags: 50,
      bagType: 'Hybrid',
      bagPrice: 10,
      rentMonths: 3,
    });
    expect(monthlyRent).toBe(1500);
  });

  it('preserves Hybrid when merging two Hybrid lots, transitions to S+B when mixed with S or B', () => {
    expect(
      resolveMergedBagType({
        targetBagType: 'Hybrid',
        sourceBagTypes: ['Hybrid'],
        newSmallBags: 50,
        newBigBags: 50,
      }),
    ).toBe('Hybrid');

    expect(
      resolveMergedBagType({
        targetBagType: 'Hybrid',
        sourceBagTypes: ['S'],
        newSmallBags: 50,
        newBigBags: 50,
      }),
    ).toBe('S+B');
  });

  it('formats bagType Hybrid as clean display label', () => {
    expect(formatDisplayBagType({ bagType: 'Hybrid' })).toBe('Hybrid');
  });
});
