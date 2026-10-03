import { describe, expect, it } from 'vitest';
import {
  calculateMonthlyCharge,
  calculateRentAmount,
  deriveBagPrice,
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
});
