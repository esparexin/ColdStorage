import { describe, expect, it } from 'vitest';
import {
  CANONICAL_BAG_RATES,
  calculateMonthlyCharge,
  calculateMonthlyOccupancy,
  calculateRentAmount,
  deriveBagPrice,
  resolveOutwardRates,
  SEASONAL_RENT_MONTHS,
} from '../index.js';

describe('Authoritative Bag Pricing & Rental Calculation SSOT', () => {
  it('1. calculates seasonal rent as Original Inward Bags × Bag Price × 10 Months', () => {
    const rent = calculateRentAmount({
      rentType: 'Seasonal',
      bags: 100,
      bagPrice: 10,
    });
    // 100 bags × ₹10 × 10 months = ₹10,000
    expect(rent).toBe(10000);
    expect(SEASONAL_RENT_MONTHS).toBe(10);
  });

  it('2. calculates monthly rent for initial inward as Bags × Bag Price × Rent Months', () => {
    const rent1Month = calculateRentAmount({
      rentType: 'Monthly',
      bags: 100,
      bagPrice: 10,
      rentMonths: 1,
    });
    // 100 bags × ₹10 = ₹1,000
    expect(rent1Month).toBe(1000);

    const rent6Months = calculateRentAmount({
      rentType: 'Monthly',
      bags: 100,
      bagPrice: 10,
      rentMonths: 6,
    });
    // 100 bags × ₹10 × 6 = ₹6,000
    expect(rent6Months).toBe(6000);
  });

  it('3. calculates S+B mixed bags with distinct small and big bag pricing', () => {
    const seasonalMixed = calculateRentAmount({
      rentType: 'Seasonal',
      bags: 100,
      bagType: 'S+B',
      smallBags: 60,
      bigBags: 40,
      smallBagPrice: 8,
      bigBagPrice: 12,
    });
    // (60 × 8 + 40 × 12) × 10 = (480 + 480) × 10 = 960 × 10 = ₹9,600
    expect(seasonalMixed).toBe(9600);

    const monthlyMixed = calculateRentAmount({
      rentType: 'Monthly',
      bags: 100,
      bagType: 'S+B',
      smallBags: 60,
      bigBags: 40,
      smallBagPrice: 8,
      bigBagPrice: 12,
      rentMonths: 1,
    });
    // 60 × 8 + 40 × 12 = ₹960
    expect(monthlyMixed).toBe(960);
  });

  it('4. calculates monthly period charge against remaining bags (Section 7 rule)', () => {
    // 100 bags remaining
    expect(calculateMonthlyCharge(100, 10)).toBe(1000);
    // After 10 bags delivered -> 90 remaining
    expect(calculateMonthlyCharge(90, 10)).toBe(900);
    // After 20 bags delivered -> 70 remaining
    expect(calculateMonthlyCharge(70, 10)).toBe(700);
    // When remaining bags = 0 -> 0
    expect(calculateMonthlyCharge(0, 10)).toBe(0);
  });

  it('5. derives effective bag price accurately and falls back gracefully for historical records', () => {
    expect(deriveBagPrice({ rentType: 'Seasonal', bags: 100, bagPrice: 15 })).toBe(15);
    // Derived from historical lump-sum: ₹10,000 / (100 bags × 10 months) = ₹10
    expect(deriveBagPrice({ rentType: 'Seasonal', bags: 100, rentAmount: 10000 })).toBe(10);
    // Derived from monthly lump-sum: ₹3,000 / (100 bags × 3 months) = ₹10
    expect(deriveBagPrice({ rentType: 'Monthly', bags: 100, rentMonths: 3, rentAmount: 3000 })).toBe(10);
  });

  it('6. calculates deterministic monthly occupancy periods across partial and final outward lifecycle', () => {
    const inwardDate = new Date('2026-01-01T00:00:00.000Z');
    const mar10 = new Date('2026-03-10T10:00:00.000Z');
    const may10 = new Date('2026-05-10T10:00:00.000Z');
    const asOfMay31 = new Date('2026-05-31T23:59:59.000Z');

    const periods = calculateMonthlyOccupancy({
      grnId: 'grn-001',
      grnNumber: 'GRN-25-26-0001',
      inwardDate,
      totalBags: 100,
      bagRate: 10,
      movements: [
        { date: mar10, type: 'PARTIAL_OUTWARD', deliveredBags: 40, closingBags: 60 },
        { date: may10, type: 'FINAL_OUTWARD', deliveredBags: 60, closingBags: 0 },
      ],
      asOfDate: asOfMay31,
    });

    expect(periods).toHaveLength(5);

    // Month 1 (January): 100 bags
    expect(periods[0].periodIndex).toBe(1);
    expect(periods[0].openingBags).toBe(100);
    expect(periods[0].deliveredBags).toBe(0);
    expect(periods[0].remainingBags).toBe(100);
    expect(periods[0].calculatedCharge).toBe(1000);

    // Month 2 (February): 100 bags
    expect(periods[1].periodIndex).toBe(2);
    expect(periods[1].openingBags).toBe(100);
    expect(periods[1].deliveredBags).toBe(0);
    expect(periods[1].remainingBags).toBe(100);
    expect(periods[1].calculatedCharge).toBe(1000);

    // Month 3 (March): 40 delivered, 60 remaining
    expect(periods[2].periodIndex).toBe(3);
    expect(periods[2].openingBags).toBe(100);
    expect(periods[2].deliveredBags).toBe(40);
    expect(periods[2].remainingBags).toBe(60);
    expect(periods[2].calculatedCharge).toBe(1000);

    // Month 4 (April): 60 bags
    expect(periods[3].periodIndex).toBe(4);
    expect(periods[3].openingBags).toBe(60);
    expect(periods[3].deliveredBags).toBe(0);
    expect(periods[3].remainingBags).toBe(60);
    expect(periods[3].calculatedCharge).toBe(600);

    // Month 5 (May): remaining 60 delivered -> 0 remaining
    expect(periods[4].periodIndex).toBe(5);
    expect(periods[4].openingBags).toBe(60);
    expect(periods[4].deliveredBags).toBe(60);
    expect(periods[4].remainingBags).toBe(0);
    expect(periods[4].calculatedCharge).toBe(600);
  });

  it('7. exposes canonical bag rates for Seasonal and Monthly Small and Big bags', () => {
    expect(CANONICAL_BAG_RATES.Seasonal).toEqual({ small: 10, big: 15 });
    expect(CANONICAL_BAG_RATES.Monthly).toEqual({ small: 10, big: 15 });
  });

  it('8. resolves outward effective rates with GRN overrides falling back to canonical', () => {
    expect(resolveOutwardRates('Seasonal', {})).toEqual({ small: 10, big: 15 });
    expect(resolveOutwardRates('Seasonal', null)).toEqual({ small: 10, big: 15 });
    expect(resolveOutwardRates('Seasonal', { smallBagPrice: 12, bigBagPrice: 12 })).toEqual({
      small: 12,
      big: 12,
    });
    expect(resolveOutwardRates('Seasonal', { bagPrice: 12 })).toEqual({ small: 12, big: 12 });
    // Partial override falls back per side, not to zero
    expect(resolveOutwardRates('Seasonal', { smallBagPrice: 9 })).toEqual({ small: 9, big: 15 });
  });
});

